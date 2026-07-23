import urllib.request
import json
import os
import sys
import configparser
from datetime import datetime

# Force UTF-8 output encoding for Windows terminal compatibility
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration
CONFIG_FILE = "config.ini"
BALANCE_THRESHOLD = 100.0  # Minimum Balance BDT threshold for alert

def load_config():
    """Loads account numbers from config.ini. Creates a template if not found."""
    config = configparser.ConfigParser()
    if not os.path.exists(CONFIG_FILE):
        config['ACCOUNT'] = {
            '1st': '21007757',
            '2nd': '34113471',
            '3rd-1': '21007685',
            '3rd-2': '34113481',
            '4th': '34113501',
        }
        try:
            with open(CONFIG_FILE, 'w') as f:
                config.write(f)
            print(f"'{CONFIG_FILE}' created with default accounts.")
        except IOError as e:
            print(f"Failed to create config.ini: {e}")
            sys.exit(1)
    
    config.read(CONFIG_FILE)
    return config

def notify_user(title, message):
    try:
        from plyer import notification
        notification.notify(
            title=title,
            message=message,
            timeout=10
        )
    except Exception:
        pass

def fetch_desco_account(account_name: str, account_number: str):
    """
    Fetches real-time meter balance and customer details directly from DESCO REST API.
    Fast execution (< 300ms) without Playwright browser overhead.
    """
    url = f"https://prepaid.desco.org.bd/api/tkdes/customer/getBalance?accountNo={account_number}&meterNo="
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                raw_data = json.loads(response.read().decode('utf-8'))
                data = raw_data.get('data', {})
                
                balance_val = float(data.get('balance', 0.0))
                meter_no = data.get('meterNo', 'N/A')
                
                print(f"[{datetime.now().strftime('%H:%M:%S')}] {account_name.upper():<10} | Acc: {account_number} | Meter: {meter_no} | Balance: {balance_val:8.2f} BDT")
                
                if balance_val < BALANCE_THRESHOLD:
                    notify_user(
                        title=f"CRITICAL DESCO BALANCE: {account_name.upper()}",
                        message=f"Account {account_number} remaining balance is {balance_val:.2f} BDT!"
                    )
                    return True
                return False
    except Exception as e:
        print(f"Error fetching data for {account_name} ({account_number}): {e}")
        return False

def main():
    print("=========================================================")
    print("      DESCO PREPAID METER FAST REST API CHECKER")
    print("=========================================================")
    config = load_config()
    accounts = config['ACCOUNT']
    
    critical_found = False
    for name, acc_num in accounts.items():
        if fetch_desco_account(name, acc_num):
            critical_found = True
            
    print("=========================================================")
    if critical_found:
        print("ALERT: One or more accounts fall below the 100 BDT threshold!")
    else:
        print("SUCCESS: All monitored accounts are healthy.")

if __name__ == "__main__":
    main()
