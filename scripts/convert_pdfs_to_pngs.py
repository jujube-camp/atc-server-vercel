#!/usr/bin/env python3
"""
Script to convert all PDF files in the pdfs directory to PNG images.
Output images are saved in the pngs directory with the same folder structure.
"""

import os
from pathlib import Path
from pdf2image import convert_from_path
from PIL import Image


def convert_pdf_to_png(pdf_path, output_dir):
    """
    Convert a single PDF file to PNG images.
    
    Args:
        pdf_path: Path to the PDF file
        output_dir: Directory to save the PNG images
    """
    try:
        print(f"Converting: {pdf_path}")
        
        # Convert PDF to images
        images = convert_from_path(pdf_path, dpi=300)
        
        # Get the base filename without extension
        pdf_filename = os.path.splitext(os.path.basename(pdf_path))[0]
        
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Save each page as a PNG
        for i, image in enumerate(images, start=1):
            if len(images) == 1:
                # Single page PDF - save without page number
                output_path = os.path.join(output_dir, f"{pdf_filename}.png")
            else:
                # Multi-page PDF - save with page number
                output_path = os.path.join(output_dir, f"{pdf_filename}_page_{i}.png")
            
            image.save(output_path, "PNG")
            print(f"  Saved: {output_path}")
        
        return True
    except Exception as e:
        print(f"  Error converting {pdf_path}: {str(e)}")
        return False


def main():
    """
    Main function to process all PDFs in the pdfs directory.
    """
    # Get the script directory and set up paths
    script_dir = Path(__file__).parent
    pdfs_dir = script_dir / "pdfs"
    pngs_dir = script_dir / "pngs"
    
    # Check if pdfs directory exists
    if not pdfs_dir.exists():
        print(f"Error: pdfs directory not found at {pdfs_dir}")
        return
    
    # Find all PDF files recursively
    pdf_files = list(pdfs_dir.rglob("*.pdf"))
    
    if not pdf_files:
        print("No PDF files found in the pdfs directory")
        return
    
    print(f"Found {len(pdf_files)} PDF files to convert\n")
    
    # Convert each PDF
    success_count = 0
    fail_count = 0
    
    for pdf_path in pdf_files:
        # Calculate relative path from pdfs_dir
        relative_path = pdf_path.relative_to(pdfs_dir)
        
        # Create corresponding output directory in pngs
        output_dir = pngs_dir / relative_path.parent
        
        # Convert the PDF
        if convert_pdf_to_png(pdf_path, output_dir):
            success_count += 1
        else:
            fail_count += 1
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"Conversion complete!")
    print(f"Successfully converted: {success_count}")
    print(f"Failed: {fail_count}")
    print(f"Output directory: {pngs_dir}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

