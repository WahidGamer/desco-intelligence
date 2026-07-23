import asyncio
import customtkinter
from playwright.async_api import async_playwright
import re
import os
import time
from datetime import datetime
from threading import Thread
import tkinter as tk
from bs4 import BeautifulSoup
import configparser

DEFAULT_WINDOW_WIDTH = 1000
DEFAULT_WINDOW_HEIGHT = 700
MIN_WINDOW_WIDTH = 1000
MIN_WINDOW_HEIGHT = 700

DEFAULT_ACCOUNT_NUMBERS = {
    "Fix Config": "123",
}

MAX_WAIT_SECONDS = 30
CRITICAL_BALANCE_THRESHOLD = 100.0
LOW_BALANCE_THRESHOLD = 300.0
STORAGE_DIR = os.path.join(os.path.dirname(__file__), "desco_sessions")
CONFIG_FILE = os.path.join(STORAGE_DIR, "config.ini")
DELAY_BETWEEN_CHECKS_SECONDS = 0

os.makedirs(STORAGE_DIR, exist_ok=True)

ACCOUNT_DETAILS = {}

def get_recharge_time_from_html(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    recharge_time_p_tag = soup.find('p', string=lambda text: text and "Recharge time:" in text)
    if recharge_time_p_tag:
        spans = recharge_time_p_tag.find_all('span')
        if len(spans) > 1 and spans[1].text.strip():
            return spans[1].text.strip()
    return None

async def wait_for_valid_balance(page, account_name, log_callback, max_wait=MAX_WAIT_SECONDS):
    balance_regex = re.compile(r"-?[\d,.]+ BDT") 
    balance_locator = page.locator("p:has-text('Remaining Balance:') >> span:first-child")
    start_time = time.time()
    while time.time() - start_time < max_wait:
        try:
            await balance_locator.wait_for(state='visible', timeout=5000)
            text = await balance_locator.text_content(timeout=5000)
            if text and balance_regex.fullmatch(text.strip()):
                try:
                    value = float(text.replace(" BDT", "").replace(",", ""))
                    log_callback(account_name, f"Balance found: {text.strip()}")
                    return value, text.strip()
                except ValueError:
                    log_callback(account_name, f"Debug: Could not parse balance value from text: {text.strip()}")
            else:
                log_callback(account_name, f"Debug: Balance element found but content '{text.strip()}' does not match expected format.")
        except Exception as e:
            log_callback(account_name, f"Debug: Error finding or getting balance text: {e}")
        await asyncio.sleep(1)
    log_callback(account_name, "Timeout waiting for valid balance or balance is zero.")
    return None, None

async def check_single_account(account_name, account_number, log_callback, update_ui_callback):
    log_callback(account_name, f"Starting check for account: {account_number}")
    storage_file = os.path.join(STORAGE_DIR, f"desco_storage_{account_number}.json")
    
    browser = None
    context = None
    
    scan_finish_time_str = datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")

    try:
        log_callback(account_name, "Initializing Playwright...")
        async with async_playwright() as p:
            log_callback(account_name, "Launching browser in headless mode...")
            browser = await p.chromium.launch(headless=True)

            log_callback(account_name, f"Checking for existing session state at {storage_file}...")
            if os.path.exists(storage_file):
                log_callback(account_name, f"Loading stored session for {account_number}...")
                context = await browser.new_context(storage_state=storage_file)
            else:
                log_callback(account_name, "No stored session found, creating new context for login.")
                context = await browser.new_context()

            page = await context.new_page()
            log_callback(account_name, "Navigating to DESCO login page...")
            await page.goto("https://prepaid.desco.org.bd/customer/#/customer-login")
            log_callback(account_name, "Navigation complete. Checking login status...")

            if not os.path.exists(storage_file):
                log_callback(account_name, "Attempting login...")
                try:
                    await page.wait_for_selector("input[placeholder='Account/Meter No']", timeout=10000)
                    await page.fill("input[placeholder='Account/Meter No']", account_number)
                    log_callback(account_name, "Filled account number.")
                    await page.click("button:has-text('Login')")
                    await page.wait_for_url("https://prepaid.desco.org.bd/customer/#/customer-info", timeout=15000)
                    log_callback(account_name, "Successfully navigated to customer info page after login.")
                    await context.storage_state(path=storage_file)
                    log_callback(account_name, "Session state saved.")
                except Exception as e:
                    log_callback(account_name, f"Login failed for {account_name}: {e}")
                    update_ui_callback(account_name, "🚫 Login Failed", "N/A", "N/A", "N/A", scan_finish_time_str, "red", "red") 
                    return
            else:
                log_callback(account_name, "Navigating to customer info page using stored session.")
                await page.goto("https://prepaid.desco.org.bd/customer/#/customer-info")
                await page.wait_for_load_state('networkidle', timeout=MAX_WAIT_SECONDS * 1000)
                if "customer-info" not in page.url:
                    log_callback(account_name, "Stored session might be expired. Attempting re-login.")
                    await page.goto("https://prepaid.desco.org.bd/customer/#/customer-login")
                    try:
                        await page.wait_for_selector("input[placeholder='Account/Meter No']", timeout=10000)
                        await page.fill("input[placeholder='Account/Meter No']", account_number)
                        log_callback(account_name, "Filled account number for re-login.")
                        await page.click("button:has-text('Login')")
                        await page.wait_for_url("https://prepaid.desco.org.bd/customer/#/customer-info", timeout=15000)
                        log_callback(account_name, "Successfully re-logged in and navigated to customer info page.")
                        await context.storage_state(path=storage_file)
                        log_callback(account_name, "New session state saved after re-login.")
                    except Exception as e:
                        log_callback(account_name, f"Re-login failed for {account_name}: {e}")
                        update_ui_callback(account_name, "🚫 Login Failed", "N/A", "N/A", "N/A", scan_finish_time_str, "red", "red") 
                        return

            balance_value = None
            balance_text = "N/A"
            payment_info_display_text = "N/A"
            payment_color = "red"
            last_recharge_amount = "N/A"
            final_status_with_emoji = "⚪ Unknown"
            final_status_color = "grey"
            days_since_payment = float('inf')

            balance_value, balance_text = await wait_for_valid_balance(page, account_name, log_callback)
            if balance_value is None:
                log_callback(account_name, "Failed to retrieve balance or balance is zero.")
                final_status_with_emoji = "❌ Balance Failed"
                final_status_color = "red"
            else:
                balance_status = ""
                balance_status_color = ""
                balance_status_emoji = ""

                if balance_value < CRITICAL_BALANCE_THRESHOLD:
                    balance_status = "Critical Balance"
                    balance_status_color = "red"
                    balance_status_emoji = "🔴"
                    log_callback(account_name, f"Critical balance detected: {balance_value:.2f} BDT. Immediate recharge required!")
                elif balance_value < LOW_BALANCE_THRESHOLD:
                    balance_status = "Low Balance"
                    balance_status_color = "orange"
                    balance_status_emoji = "🟠"
                    log_callback(account_name, f"Low balance detected: {balance_value:.2f} BDT. Consider recharging soon.")
                else:
                    balance_status = "Normal Balance"
                    balance_status_color = "green"
                    balance_status_emoji = "🟢"
                    log_callback(account_name, f"Balance: {balance_value:.2f} BDT. All good!")
                
                final_status_with_emoji = f"{balance_status_emoji} {balance_status}"
                final_status_color = balance_status_color
            
            log_callback(account_name, "Attempting to find and stabilize 'Recharge time'...")
            recharge_time_locator = page.locator("p:has-text('Recharge time:') >> br + span")
            extracted_recharge_time_str = None
            date_pattern = re.compile(r"\d{1,2} \w+ \d{4} \d{2}:\d{2}")

            start_time = time.time()
            while time.time() - start_time < MAX_WAIT_SECONDS:
                try:
                    await recharge_time_locator.wait_for(state='visible', timeout=5000)
                    text_found = await recharge_time_locator.text_content(timeout=5000) 
                    if text_found and date_pattern.fullmatch(text_found.strip()):
                        extracted_recharge_time_str = text_found.strip()
                        log_callback(account_name, f"Found stable Recharge time: {extracted_recharge_time_str}")
                        break
                except Exception as e:
                    pass
                await asyncio.sleep(1)

            payment_date_obj = None
            payment_color = "red"

            if extracted_recharge_time_str:
                try:
                    payment_date_obj = datetime.strptime(extracted_recharge_time_str, "%d %b %Y %H:%M")
                    time_difference = datetime.now() - payment_date_obj
                    days_since_payment = time_difference.days

                    if days_since_payment < 1:
                        payment_info_display_text = f"{payment_date_obj.strftime('%d %b %Y %I:%M %p')} (Today)"
                        payment_color = "green"
                    elif days_since_payment < 7:
                        payment_info_display_text = f"{payment_date_obj.strftime('%d %b %Y %I:%M %p')} ({days_since_payment} days ago)"
                        payment_color = "green"
                    elif 7 <= days_since_payment <= 30:
                        payment_info_display_text = f"{payment_date_obj.strftime('%d %b %Y %I:%M %p')} ({days_since_payment} days ago)"
                        payment_color = "orange"
                    else:
                        payment_info_display_text = f"{payment_date_obj.strftime('%d %b %Y %I:%M %p')} ({days_since_payment} days ago)"
                        payment_color = "red"
                    log_callback(account_name, f"Last Payment Date (Recharge Time): {payment_info_display_text}")
                except ValueError as e:
                    log_callback(account_name, f"Error parsing extracted Recharge time '{extracted_recharge_time_str}': {e}")
            else:
                log_callback(account_name, "Recharge time could not be found or stabilized within timeout.")
            
            log_callback(account_name, "Attempting to find Last Recharge Amount using BeautifulSoup...")
            last_recharge_amount = "N/A"

            try:
                html_content = await page.content()
                soup = BeautifulSoup(html_content, 'html.parser')

                target_p_selector = 'p[data-v-56f4a17e][style*="font-weight: bold;"]'
                parent_p = soup.select_one(target_p_selector)

                if parent_p:
                    target_span = parent_p.find('span') 
                    if target_span:
                        amount_text = target_span.text.strip()
                        if amount_text and re.match(r"[\d,.]+\s*BDT", amount_text):
                            last_recharge_amount = amount_text
                            log_callback(account_name, f"Last Recharge Amount found (BS): {last_recharge_amount}")
                        else:
                            log_callback(account_name, f"Last Recharge Amount found (BS) but content '{amount_text}' does not match expected format.")
                    else:
                        log_callback(account_name, "Span not found within the parent p (BS).")
                else:
                    log_callback(account_name, "Parent p for Last Recharge Amount not found (BS).")

            except Exception as e:
                log_callback(account_name, f"Error extracting Last Recharge Amount with BeautifulSoup: {e}")

            if days_since_payment < 1:
                final_status_with_emoji = "🟢 Paid Today"
                final_status_color = "green"
                log_callback(account_name, f"Account {account_name} status overwritten to 'Paid Today' due to recent payment.")

            if account_name in ACCOUNT_DETAILS:
                ACCOUNT_DETAILS[account_name]["status"] = final_status_with_emoji
                ACCOUNT_DETAILS[account_name]["balance"] = balance_text
                ACCOUNT_DETAILS[account_name]["payment"] = payment_info_display_text
                ACCOUNT_DETAILS[account_name]["recharge_amount"] = last_recharge_amount
                ACCOUNT_DETAILS[account_name]["last_scanned"] = scan_finish_time_str 

            update_ui_callback(account_name, final_status_with_emoji, balance_text, payment_info_display_text, last_recharge_amount, scan_finish_time_str, final_status_color, payment_color)
            log_callback(account_name, "Account check finished.")

    except Exception as e:
        log_callback(account_name, f"An unhandled error occurred for {account_name}: {e}")
        if account_name in ACCOUNT_DETAILS:
            ACCOUNT_DETAILS[account_name]["status"] = "❌ Error"
            ACCOUNT_DETAILS[account_name]["balance"] = "N/A"
            ACCOUNT_DETAILS[account_name]["payment"] = "N/A"
            ACCOUNT_DETAILS[account_name]["recharge_amount"] = "N/A"
            ACCOUNT_DETAILS[account_name]["last_scanned"] = scan_finish_time_str
        update_ui_callback(account_name, "❌ Error", "N/A", "N/A", "N/A", scan_finish_time_str, "red", "red") 
    finally:
        if browser:
            log_callback(account_name, "Closing browser.")
            await browser.close()

class App(customtkinter.CTk):
    def __init__(self):
        super().__init__()

        self.title("DESCO Balance Checker")
        
        self.grid_columnconfigure(0, weight=1) 
        self.grid_rowconfigure(0, weight=0)
        self.grid_rowconfigure(1, weight=0)
        self.grid_rowconfigure(2, weight=5)
        self.grid_rowconfigure(3, weight=0)
        self.grid_rowconfigure(4, weight=2)

        self.log_label = customtkinter.CTkLabel(self, text="Activity Log", font=customtkinter.CTkFont(family="Segoe UI", size=16, weight="bold"))
        self.log_label.grid(row=3, column=0, padx=10, pady=(10, 0), sticky="w")

        self.log_frame = customtkinter.CTkFrame(self)
        self.log_frame.grid(row=4, column=0, padx=10, pady=10, sticky="nsew")
        self.log_frame.grid_columnconfigure(0, weight=1) 
        self.log_frame.grid_rowconfigure(0, weight=1)

        self.log_textbox = customtkinter.CTkTextbox(self.log_frame, wrap="word", font=customtkinter.CTkFont(family="Consolas", size=12))
        self.log_textbox.grid(row=0, column=0, padx=10, pady=10, sticky="nsew")
        self.log_textbox.insert("end", "Welcome to DESCO Balance Checker!\n")
        self.log_textbox.configure(state="disabled")

        self.load_config()

        self.geometry(f"{self.current_window_width}x{self.current_window_height}") 
        self.minsize(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)

        customtkinter.set_appearance_mode(self.current_appearance_mode)
        customtkinter.set_default_color_theme("blue")

        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        self.control_frame = customtkinter.CTkFrame(self)
        self.control_frame.grid(row=0, column=0, padx=10, pady=10, sticky="ew")
        self.control_frame.grid_columnconfigure(0, weight=1)
        self.control_frame.grid_columnconfigure(1, weight=0)
        self.control_frame.grid_columnconfigure(2, weight=1)
        self.control_frame.grid_columnconfigure(3, weight=0)
        self.control_frame.grid_columnconfigure(4, weight=0)
        self.control_frame.grid_columnconfigure(5, weight=0)
        self.control_frame.grid_columnconfigure(6, weight=0)

        self.start_button = customtkinter.CTkButton(
            self.control_frame,
            text="Start Selected Checks",
            command=self.start_all_checks,
            font=customtkinter.CTkFont(family="Segoe UI", size=16, weight="bold"),
            height=40
        )
        self.start_button.grid(row=0, column=0, padx=10, pady=10, sticky="w")

        self.selection_buttons_frame = customtkinter.CTkFrame(self.control_frame, fg_color="transparent")
        self.selection_buttons_frame.grid(row=0, column=1, rowspan=2, padx=10, pady=0, sticky="nswe")
        self.selection_buttons_frame.grid_rowconfigure(0, weight=1)
        self.selection_buttons_frame.grid_rowconfigure(1, weight=1)
        self.selection_buttons_frame.grid_columnconfigure(0, weight=1)

        self.select_all_button = customtkinter.CTkButton(
            self.selection_buttons_frame,
            text="Select All Accounts",
            command=self.select_all_accounts,
            font=customtkinter.CTkFont(family="Segoe UI", size=14),
            height=30
        )
        self.select_all_button.grid(row=0, column=0, padx=5, pady=5, sticky="ew")

        self.remove_all_button = customtkinter.CTkButton(
            self.selection_buttons_frame,
            text="Remove All Selection",
            command=self.remove_all_accounts,
            font=customtkinter.CTkFont(family="Segoe UI", size=14),
            height=30
        )
        self.remove_all_button.grid(row=1, column=0, padx=5, pady=5, sticky="ew")
        
        customtkinter.CTkLabel(self.control_frame, text="").grid(row=0, column=2, rowspan=2, sticky="nsew") 

        self.appearance_mode_label = customtkinter.CTkLabel(self.control_frame, text="Appearance Mode:", font=customtkinter.CTkFont(family="Segoe UI", size=12))
        self.appearance_mode_label.grid(row=0, column=3, padx=(10, 0), pady=10, sticky="e")
        self.appearance_mode_optionemenu = customtkinter.CTkOptionMenu(
            self.control_frame,
            values=["Light", "Dark", "System"],
            command=self.change_appearance_mode_event,
            font=customtkinter.CTkFont(family="Segoe UI", size=12)
        )
        self.appearance_mode_optionemenu.grid(row=0, column=4, padx=10, pady=10, sticky="e")
        self.appearance_mode_optionemenu.set(self.current_appearance_mode)

        self.font_size_label = customtkinter.CTkLabel(self.control_frame, text="Text Size:", font=customtkinter.CTkFont(family="Segoe UI", size=12))
        self.font_size_label.grid(row=1, column=3, padx=(10, 0), pady=(0, 10), sticky="e")
        self.font_size_optionemenu = customtkinter.CTkOptionMenu(
            self.control_frame,
            values=["12", "14", "16", "18"],
            command=self.change_font_size_event,
            font=customtkinter.CTkFont(family="Segoe UI", size=12)
        )
        self.font_size_optionemenu.grid(row=1, column=4, padx=10, pady=(0, 10), sticky="e")
        self.font_size_optionemenu.set(str(self.current_font_size))

        self.account_label_title = customtkinter.CTkLabel(
            self,
            text="Account Status Overview",
            font=customtkinter.CTkFont(family="Segoe UI", size=16, weight="bold")
        )
        self.account_label_title.grid(row=1, column=0, padx=10, pady=(0, 5), sticky="w")

        self.account_frame = customtkinter.CTkScrollableFrame(self)
        self.account_frame.grid(row=2, column=0, padx=10, pady=(0, 10), sticky="nsew") 
        
        self.account_frame.grid_columnconfigure(0, weight=0)
        self.account_frame.grid_columnconfigure(1, weight=1)
        self.account_frame.grid_columnconfigure(2, weight=1)
        self.account_frame.grid_columnconfigure(3, weight=1)
        self.account_frame.grid_columnconfigure(4, weight=1)
        self.account_frame.grid_columnconfigure(5, weight=1)
        self.account_frame.grid_columnconfigure(6, weight=1)
        self.account_frame.grid_columnconfigure(7, weight=1)

        header_font = customtkinter.CTkFont(family="Segoe UI", weight="bold")
        customtkinter.CTkLabel(self.account_frame, text="Select", font=header_font).grid(row=0, column=0, padx=5, pady=2, sticky="w")
        customtkinter.CTkLabel(self.account_frame, text="Account Name", font=header_font).grid(row=0, column=1, padx=5, pady=2, sticky="w")
        customtkinter.CTkLabel(self.account_frame, text="Account Number", font=header_font).grid(row=0, column=2, padx=5, pady=2, sticky="w")
        customtkinter.CTkLabel(self.account_frame, text="Status", font=header_font).grid(row=0, column=3, padx=5, pady=2, sticky="w")
        customtkinter.CTkLabel(self.account_frame, text="Balance", font=header_font).grid(row=0, column=4, padx=5, pady=2, sticky="w")
        customtkinter.CTkLabel(self.account_frame, text="Last Payment", font=header_font).grid(row=0, column=5, padx=5, pady=2, sticky="w")
        customtkinter.CTkLabel(self.account_frame, text="Last Recharge Amount", font=header_font).grid(row=0, column=6, padx=5, pady=2, sticky="w")
        customtkinter.CTkLabel(self.account_frame, text="Last Scanned", font=header_font).grid(row=0, column=7, padx=5, pady=2, sticky="w")

        self.account_selection_vars = {}
        self.update_account_numbers_display()

    def load_config(self):
        global ACCOUNT_DETAILS

        config = configparser.ConfigParser()
        if os.path.exists(CONFIG_FILE):
            config.read(CONFIG_FILE, encoding='utf-8')

            try:
                self.current_window_width = int(config.get('Window', 'width', fallback=DEFAULT_WINDOW_WIDTH))
                self.current_window_height = int(config.get('Window', 'height', fallback=DEFAULT_WINDOW_HEIGHT))
            except ValueError:
                self.log_message("System", "Invalid window size in config, using defaults.")
                self.current_window_width = DEFAULT_WINDOW_WIDTH
                self.current_window_height = DEFAULT_WINDOW_HEIGHT

            self.current_appearance_mode = config.get('Appearance', 'mode', fallback="Dark")

            try:
                self.current_font_size = int(config.get('Appearance', 'font_size', fallback=14))
            except ValueError:
                self.log_message("System", "Invalid font size in config, using default (14).")
                self.current_font_size = 14

            ACCOUNT_DETAILS.clear()
            if 'Accounts' in config:
                for name, number in config.items('Accounts'):
                    ACCOUNT_DETAILS[name] = {
                        "number": number,
                        "status": config.get(f'Account_{name}', 'status', fallback="⚪ Idle"),
                        "balance": config.get(f'Account_{name}', 'balance', fallback="N/A"),
                        "payment": config.get(f'Account_{name}', 'payment', fallback="N/A"),
                        "recharge_amount": config.get(f'Account_{name}', 'recharge_amount', fallback="N/A"),
                        "last_scanned": config.get(f'Account_{name}', 'last_scanned', fallback="Never")
                    }
                if not ACCOUNT_DETAILS:
                    for name, num in DEFAULT_ACCOUNT_NUMBERS.items():
                        ACCOUNT_DETAILS[name] = {
                            "number": num,
                            "status": "⚪ Idle",
                            "balance": "N/A",
                            "payment": "N/A",
                            "recharge_amount": "N/A",
                            "last_scanned": "Never"
                        }
            else:
                for name, num in DEFAULT_ACCOUNT_NUMBERS.items():
                    ACCOUNT_DETAILS[name] = {
                        "number": num,
                        "status": "⚪ Idle",
                        "balance": "N/A",
                        "payment": "N/A",
                        "recharge_amount": "N/A",
                        "last_scanned": "Never"
                    }
        else:
            self.log_message("System", f"No config file found at {CONFIG_FILE}, creating one with default settings.")
            self.current_window_width = DEFAULT_WINDOW_WIDTH
            self.current_window_height = DEFAULT_WINDOW_HEIGHT
            self.current_appearance_mode = "Dark"
            self.current_font_size = 14
            for name, num in DEFAULT_ACCOUNT_NUMBERS.items():
                ACCOUNT_DETAILS[name] = {
                    "number": num,
                    "status": "⚪ Idle",
                    "balance": "N/A",
                    "payment": "N/A",
                    "recharge_amount": "N/A",
                    "last_scanned": "Never"
                }

    def save_config(self):
        config = configparser.ConfigParser()

        self.update_idletasks()
        width = self.winfo_width()
        height = self.winfo_height()
        config['Window'] = {'width': str(width), 'height': str(height)}

        config['Appearance'] = {'mode': customtkinter.get_appearance_mode(),
                                'font_size': str(self.current_font_size)}

        account_numbers_only = {name: details["number"] for name, details in ACCOUNT_DETAILS.items()}
        config['Accounts'] = account_numbers_only

        for name, details in ACCOUNT_DETAILS.items():
            section_name = f'Account_{name}'
            config[section_name] = {
                'status': details.get('status', '⚪ Idle'),
                'balance': details.get('balance', 'N/A'),
                'payment': details.get('payment', 'N/A'),
                'recharge_amount': details.get('recharge_amount', 'N/A'),
                'last_scanned': details.get('last_scanned', 'Never')
            }

        with open(CONFIG_FILE, 'w', encoding='utf-8') as configfile:
            config.write(configfile)
        self.log_message("System", f"Configuration saved to {CONFIG_FILE}")

    def on_closing(self):
        self.save_config()
        self.destroy()

    def update_account_numbers_display(self):
        for widget in self.account_frame.winfo_children():
            if widget.grid_info()['row'] > 0: 
                widget.destroy()

        self.account_labels = {}
        self.account_selection_vars = {}

        data_font = customtkinter.CTkFont(family="Segoe UI", size=self.current_font_size)

        for i, (name, details) in enumerate(ACCOUNT_DETAILS.items()):
            row = i + 1
            self.account_selection_vars[name] = customtkinter.BooleanVar(value=True)

            selection_checkbox = customtkinter.CTkCheckBox(
                self.account_frame, 
                text="", 
                variable=self.account_selection_vars[name]
            )
            selection_checkbox.grid(row=row, column=0, padx=2, pady=2, sticky="w") 

            self.account_labels[name] = {
                "checkbox": selection_checkbox,
                "name": customtkinter.CTkLabel(self.account_frame, text=name, font=data_font),
                "number": customtkinter.CTkLabel(self.account_frame, text=details["number"], font=data_font),
                "status": customtkinter.CTkLabel(self.account_frame, text=details.get("status", "⚪ Idle"), font=data_font),
                "balance": customtkinter.CTkLabel(self.account_frame, text=details.get("balance", "N/A"), font=data_font),
                "payment": customtkinter.CTkLabel(self.account_frame, text=details.get("payment", "N/A"), font=data_font),
                "last_recharge_amount": customtkinter.CTkLabel(self.account_frame, text=details.get("recharge_amount", "N/A"), font=data_font),
                "last_scanned": customtkinter.CTkLabel(self.account_frame, text=details.get("last_scanned", "Never"), font=data_font)
            }
            self.account_labels[name]["name"].grid(row=row, column=1, padx=5, pady=2, sticky="w")
            self.account_labels[name]["number"].grid(row=row, column=2, padx=5, pady=2, sticky="w")
            self.account_labels[name]["status"].grid(row=row, column=3, padx=5, pady=2, sticky="w")
            self.account_labels[name]["balance"].grid(row=row, column=4, padx=5, pady=2, sticky="w")
            self.account_labels[name]["payment"].grid(row=row, column=5, padx=5, pady=2, sticky="w")
            self.account_labels[name]["last_recharge_amount"].grid(row=row, column=6, padx=5, pady=2, sticky="w")
            self.account_labels[name]["last_scanned"].grid(row=row, column=7, padx=5, pady=2, sticky="w")

            status_text = details.get("status", "⚪ Idle")
            balance_text = details.get("balance", "N/A")
            payment_text = details.get("payment", "N/A")
            recharge_amount_text = details.get("recharge_amount", "N/A")

            initial_status_color = "grey"
            initial_payment_color = "red"
            
            if "🔴" in status_text:
                initial_status_color = "red"
            elif "🟠" in status_text:
                initial_status_color = "orange"
            elif "🟢" in status_text:
                initial_status_color = "green"
            elif "🚫 Login Failed" in status_text or "❌ Balance Failed" in status_text or "❌ Error" in status_text:
                initial_status_color = "red"

            if "Today" in payment_text:
                initial_payment_color = "green"
            elif "days ago" in payment_text:
                try:
                    match = re.search(r'\((\d+)\s+days ago\)', payment_text)
                    if match:
                        days = int(match.group(1))
                        if days < 7:
                            initial_payment_color = "green"
                        elif 7 <= days <= 30:
                            initial_payment_color = "orange"
                        else:
                            initial_payment_color = "red"
                except ValueError:
                    initial_payment_color = "red"
            else:
                initial_payment_color = "red"

            self.account_labels[name]["status"].configure(text_color=initial_status_color)
            self.account_labels[name]["balance"].configure(text_color=initial_status_color)
            self.account_labels[name]["payment"].configure(text_color=initial_payment_color)

            if recharge_amount_text == "N/A":
                self.account_labels[name]["last_recharge_amount"].configure(text_color="grey")
            else:
                self.account_labels[name]["last_recharge_amount"].configure(text_color=customtkinter.ThemeManager.theme["CTkLabel"]["text_color"])
            
            self.account_labels[name]["last_scanned"].configure(text_color=customtkinter.ThemeManager.theme["CTkLabel"]["text_color"])

    def select_all_accounts(self):
        for name in self.account_selection_vars:
            self.account_selection_vars[name].set(True)

    def remove_all_accounts(self):
        for name in self.account_selection_vars:
            self.account_selection_vars[name].set(False)

    def change_appearance_mode_event(self, new_appearance_mode: str):
        customtkinter.set_appearance_mode(new_appearance_mode)

    def change_font_size_event(self, new_size_str: str):
        try:
            new_size = int(new_size_str)
            self.current_font_size = new_size
            data_font = customtkinter.CTkFont(family="Segoe UI", size=self.current_font_size)

            for account_name in self.account_labels:
                labels = self.account_labels[account_name]
                labels["name"].configure(font=data_font)
                labels["number"].configure(font=data_font)
                labels["status"].configure(font=data_font)
                labels["balance"].configure(font=data_font)
                labels["payment"].configure(font=data_font)
                labels["last_recharge_amount"].configure(font=data_font)
                labels["last_scanned"].configure(font=data_font)
        except ValueError:
            self.log_message("Error", f"Invalid font size selected: {new_size_str}")

    def log_message(self, account_name, message):
        timestamp = datetime.now().strftime("%H:%M:%S %p")
        self.after(0, lambda: self._update_log_textbox(f"[{timestamp}] [{account_name}] {message}\n"))

    def _update_log_textbox(self, message):
        if hasattr(self, 'log_textbox') and self.log_textbox is not None:
            self.log_textbox.configure(state="normal")
            self.log_textbox.insert("end", message)
            self.log_textbox.see("end")
            self.log_textbox.configure(state="disabled")

    def update_account_ui(self, account_name, status, balance, payment, last_recharge_amount, last_scanned_time, status_color=None, payment_color=None):
        self.after(0, lambda: self._perform_ui_update(account_name, status, balance, payment, last_recharge_amount, last_scanned_time, status_color, payment_color))

    def _perform_ui_update(self, account_name, status, balance, payment, last_recharge_amount, last_scanned_time, status_color, payment_color):
        if account_name in self.account_labels:
            self.account_labels[account_name]["status"].configure(text=status)
            self.account_labels[account_name]["balance"].configure(text=balance)
            self.account_labels[account_name]["payment"].configure(text=payment)
            self.account_labels[account_name]["last_recharge_amount"].configure(text=last_recharge_amount)
            self.account_labels[account_name]["last_scanned"].configure(text=last_scanned_time)
            
            if status_color:
                self.account_labels[account_name]["status"].configure(text_color=status_color)
                self.account_labels[account_name]["balance"].configure(text_color=status_color) 
            else:
                self.account_labels[account_name]["status"].configure(text_color="grey") 
                self.account_labels[account_name]["balance"].configure(text_color="grey")

            if payment_color:
                self.account_labels[account_name]["payment"].configure(text_color=payment_color)
            else:
                self.account_labels[account_name]["payment"].configure(text_color="grey")
            
            if last_recharge_amount == "N/A":
                self.account_labels[account_name]["last_recharge_amount"].configure(text_color="grey")
            else:
                self.account_labels[account_name]["last_recharge_amount"].configure(text_color=customtkinter.ThemeManager.theme["CTkLabel"]["text_color"])

            if "Error" in status or "Failed" in status:
                self.account_labels[account_name]["last_scanned"].configure(text_color="red")
            else:
                 self.account_labels[account_name]["last_scanned"].configure(text_color=customtkinter.ThemeManager.theme["CTkLabel"]["text_color"])

    def start_all_checks(self):
        selected_accounts_info = {}
        for name, var in self.account_selection_vars.items():
            if var.get():
                if name in ACCOUNT_DETAILS:
                    selected_accounts_info[name] = ACCOUNT_DETAILS[name]["number"]
                else:
                    self.log_message("Error", f"Account '{name}' selected but not found in ACCOUNT_DETAILS.")

        if not selected_accounts_info:
            self.log_message("System", "No accounts selected for checking.")
            return

        self.start_button.configure(state="disabled", text="Checking...")

        for name in selected_accounts_info:
            self.update_account_ui(name, "🔄 Checking...", "N/A", "N/A", "N/A", "Scanning...", "grey", "grey") 

        async def run_sequential_checks():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            for name, num in selected_accounts_info.items():
                await check_single_account(name, num, self.log_message, self.update_account_ui)
                if name != list(selected_accounts_info.keys())[-1] and DELAY_BETWEEN_CHECKS_SECONDS > 0:
                    self.log_message("System", f"Waiting {DELAY_BETWEEN_CHECKS_SECONDS} seconds before next account...")
                    await asyncio.sleep(DELAY_BETWEEN_CHECKS_SECONDS)
            
            loop.close()

            self.after(0, lambda: self.start_button.configure(state="normal", text="Start Selected Checks"))
            self.after(0, lambda: self.log_message("System", "All selected account checks completed."))
            self.after(0, self.save_config)

        thread = Thread(target=lambda: asyncio.run(run_sequential_checks()))
        thread.daemon = True
        thread.start()

if __name__ == "__main__":
    app = App()
    app.mainloop()
