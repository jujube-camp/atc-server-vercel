#!/usr/bin/env python3
"""
Test script to handle problematic M4A files
"""

import os
import tempfile
from pathlib import Path
from pydub import AudioSegment

def test_audio_conversion(audio_path: Path):
    """Test different approaches to convert problematic audio files."""
    
    print(f"Testing conversion of: {audio_path}")
    print(f"File size: {audio_path.stat().st_size} bytes")
    
    # Create temporary output file
    temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    temp_wav.close()
    
    try:
        # Method 1: Try pydub with different parameters
        print("\n=== Method 1: Pydub with default settings ===")
        try:
            audio = AudioSegment.from_file(str(audio_path))
            print(f"Success! Audio info: {len(audio)}ms, {audio.frame_rate}Hz, {audio.channels} channels")
            
            # Export as WAV
            audio.export(temp_wav.name, format="wav")
            print(f"Exported to: {temp_wav.name}")
            return Path(temp_wav.name)
            
        except Exception as e:
            print(f"Method 1 failed: {e}")
        
        # Method 2: Try with specific format hint
        print("\n=== Method 2: Pydub with format hint ===")
        try:
            audio = AudioSegment.from_file(str(audio_path), format="m4a")
            print(f"Success! Audio info: {len(audio)}ms, {audio.frame_rate}Hz, {audio.channels} channels")
            
            # Export as WAV
            audio.export(temp_wav.name, format="wav")
            print(f"Exported to: {temp_wav.name}")
            return Path(temp_wav.name)
            
        except Exception as e:
            print(f"Method 2 failed: {e}")
        
        # Method 3: Try with different codec
        print("\n=== Method 3: Pydub with different codec ===")
        try:
            audio = AudioSegment.from_file(str(audio_path), codec="aac")
            print(f"Success! Audio info: {len(audio)}ms, {audio.frame_rate}Hz, {audio.channels} channels")
            
            # Export as WAV
            audio.export(temp_wav.name, format="wav")
            print(f"Exported to: {temp_wav.name}")
            return Path(temp_wav.name)
            
        except Exception as e:
            print(f"Method 3 failed: {e}")
        
        print("\nAll methods failed. The file may be corrupted or in an unsupported format.")
        return None
        
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None

if __name__ == "__main__":
    audio_path = Path("test_audio.m4a")
    if audio_path.exists():
        result = test_audio_conversion(audio_path)
        if result:
            print(f"\n✅ Successfully converted to: {result}")
        else:
            print("\n❌ Could not convert the file")
    else:
        print(f"File not found: {audio_path}")
