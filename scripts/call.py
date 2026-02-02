#!/usr/bin/env python3
"""
Simple audio transcription using GPT-4o audio preview.

Usage:
  python call.py path/to/audio.m4a
  
Environment:
  export OPENAI_API_KEY=sk-...
"""

import argparse
import base64
import os
import sys
import tempfile
from pathlib import Path

from openai import OpenAI

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False

# Use OPENAI_API_KEY from environment (export OPENAI_API_KEY=sk-...)
if "OPENAI_API_KEY" not in os.environ:
    sys.exit("OPENAI_API_KEY must be set in environment")


def transcribe_audio(audio_path: Path, prompt: str = "What is in this recording?"):
    """Transcribe audio using GPT-4o audio preview."""
    client = OpenAI()
    
    
    # Read the audio file and convert to base64
    with open(audio_path, "rb") as audio_file:
        audio_data = audio_file.read()
    
    encoded_string = base64.b64encode(audio_data).decode('utf-8')
    
    # Get file format from extension
    file_format = audio_path.suffix.lower().lstrip('.')
    
    completion = client.chat.completions.create(
        model="gpt-4o-audio-preview",
        modalities=["text"],
        #audio={"voice": "alloy", "format": file_format},
        messages=[
            {
                "role": "user",
                "content": [
                    { 
                        "type": "text",
                        "text": prompt
                    },
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": encoded_string,
                            "format": file_format
                        }
                    }
                ]
            },
        ]
    )
    
    return completion.choices[0].message

def main():
    parser = argparse.ArgumentParser(description="Simple audio transcription with GPT-4o audio preview")
    parser.add_argument("audio_path", type=Path, help="Path to audio file")
    parser.add_argument("--prompt", default="You are a ATC controller at an airport. Transcribe the audio.", help="Custom prompt for GPT-4o processing")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    args = parser.parse_args()

    if not args.audio_path.exists():
        print(f"ERROR: File not found: {args.audio_path}", file=sys.stderr)
        sys.exit(2)

    result = transcribe_audio(args.audio_path, args.prompt)
    print(result)

if __name__ == "__main__":
    main()