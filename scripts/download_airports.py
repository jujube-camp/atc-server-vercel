#!/usr/bin/env python3
"""
Periodically download airports CSV file from OurAirports and filter to keep only
US airports with non-empty ICAO codes.
"""

import csv
import sys
import time
import requests
from pathlib import Path
from datetime import datetime


# Configuration
AIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
DEFAULT_OUTPUT_DIR = Path(__file__).parent
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "data" / "airports.csv"
DEFAULT_INTERVAL_HOURS = 24  # Default: update every 24 hours


def download_file(url: str, output_path: Path, timeout: int = 30) -> bool:
    """
    Download file to specified path, overwrite if file already exists
    
    Args:
        url: URL to download from
        output_path: Path to save the file
        timeout: Request timeout in seconds
    
    Returns:
        bool: Whether download was successful
    """
    try:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting download: {url}")
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Download file
        response = requests.get(url, timeout=timeout, stream=True)
        response.raise_for_status()
        
        # Write file
        total_size = 0
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    total_size += len(chunk)
        
        file_size_mb = total_size / (1024 * 1024)
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Download completed: {output_path}")
        print(f"  File size: {file_size_mb:.2f} MB")
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Download failed: {e}")
        return False
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error occurred: {e}")
        return False


def filter_csv(input_path: Path, output_path: Path) -> bool:
    """
    Filter CSV file to keep only US airports with non-empty ICAO code
    and remove specified columns before saving
    
    Args:
        input_path: Path to input CSV file
        output_path: Path to save filtered CSV file
    
    Returns:
        bool: Whether filtering was successful
    """
    try:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting CSV filtering...")
        
        # Columns to exclude from output
        columns_to_remove = {'id', 'home_link', 'wikipedia_link', 'keywords'}
        
        total_rows = 0
        filtered_rows = 0
        
        with open(input_path, 'r', encoding='utf-8') as infile:
            reader = csv.DictReader(infile)
            fieldnames = reader.fieldnames
            
            if fieldnames is None:
                print("Error: CSV file has no headers")
                return False
            
            # Filter fieldnames to exclude specified columns
            output_fieldnames = [f for f in fieldnames if f not in columns_to_remove]
            
            filtered_data = []
            for row in reader:
                total_rows += 1
                iso_country = row.get('iso_country', '').strip()
                icao_code = row.get('icao_code', '').strip()
                
                if iso_country == 'US' and icao_code:
                    # Remove excluded columns from row
                    filtered_row = {k: v for k, v in row.items() if k not in columns_to_remove}
                    filtered_data.append(filtered_row)
                    filtered_rows += 1
        
        # Write filtered data
        with open(output_path, 'w', encoding='utf-8', newline='') as outfile:
            writer = csv.DictWriter(outfile, fieldnames=output_fieldnames)
            writer.writeheader()
            writer.writerows(filtered_data)
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] CSV filtering completed")
        print(f"  Total rows: {total_rows}")
        print(f"  Filtered rows (US with ICAO): {filtered_rows}")
        print(f"  Removed columns: {', '.join(sorted(columns_to_remove))}")
        return True
        
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] CSV filtering error: {e}")
        return False


def run_once(output_path: Path) -> bool:
    """
    Execute a single download and filter the CSV file
    
    Args:
        output_path: Output file path
    
    Returns:
        bool: Whether successful
    """
    # Download to temporary file first
    temp_path = output_path.with_suffix('.tmp.csv')
    
    if not download_file(AIRPORTS_CSV_URL, temp_path):
        return False
    
    # Filter the downloaded CSV
    if not filter_csv(temp_path, output_path):
        # Clean up temp file on error
        if temp_path.exists():
            temp_path.unlink()
        return False
    
    # Remove temporary file after successful filtering
    if temp_path.exists():
        temp_path.unlink()
    
    return True


def run_continuously(output_path: Path, interval_hours: float = 24):
    """
    Run continuously, periodically download file
    
    Args:
        output_path: Output file path
        interval_hours: Update interval in hours
    """
    interval_seconds = interval_hours * 3600
    
    print("Starting periodic download task")
    print(f"URL: {AIRPORTS_CSV_URL}")
    print(f"Output path: {output_path}")
    print(f"Update interval: {interval_hours} hours ({interval_seconds} seconds)")
    print("Press Ctrl+C to stop")
    print("-" * 60)
    
    # Execute once immediately
    run_once(output_path)
    
    # Periodic execution
    try:
        while True:
            time.sleep(interval_seconds)
            run_once(output_path)
    except KeyboardInterrupt:
        print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Program stopped")


def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Periodically download airports CSV file from OurAirports",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download once
  python download_airports.py
  
  # Download to specified path
  python download_airports.py --output ./airports.csv
  
  # Run continuously, update every 24 hours
  python download_airports.py --continuous
  
  # Run continuously, update every 12 hours
  python download_airports.py --continuous --interval 12
        """
    )
    
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=str(DEFAULT_OUTPUT_FILE),
        help=f"Output file path (default: {DEFAULT_OUTPUT_FILE})"
    )
    
    parser.add_argument(
        "--continuous", "-c",
        action="store_true",
        help="Continuous mode, periodically update file"
    )
    
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_HOURS,
        help=f"Update interval in hours, only effective in continuous mode (default: {DEFAULT_INTERVAL_HOURS})"
    )
    
    args = parser.parse_args()
    
    output_path = Path(args.output).resolve()
    
    if args.continuous:
        run_continuously(output_path, args.interval)
    else:
        success = run_once(output_path)
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

