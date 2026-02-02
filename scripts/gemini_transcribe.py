#!/usr/bin/env python3
"""
Transcribe and evaluate pilot audio using Google Gemini API.

Usage:
  python gemini_transcribe.py path/to/audio.m4a \
      --icao ENroute --phase "departure" --callsign "N123AB"
  
Environment:
  export GEMINI_API_KEY=your_gemini_api_key_here
"""

import argparse
import asyncio
import base64
import json
import os
import sys
import tempfile
from pathlib import Path

import google.generativeai as genai
from pydub import AudioSegment


EVAL_PROMPT_TEMPLATE = """You are an aviation communication analyst.

Task:
1) Transcribe the attached audio **verbatim** (do not paraphrase).
2) Evaluate the pilot's phraseology for:
   - ICAO/FAA standard phraseology and brevity
   - Readback completeness/accuracy
   - Altitude/heading/clearance correctness
   - Call sign and runway usage
   - Any potential safety or compliance concerns
3) Summarize intent and give clear, actionable corrections.

Context (optional):
- Operating standard: {icao_standard}
- Flight phase: {phase}
- Callsign (if recognized): {callsign}

Return strict JSON with this schema:
{{
  "transcript": "string",
  "summary": "string",
  "issues": [
    {{
      "type": "phraseology|readback|altitude|heading|clearance|safety|other",
      "detail": "string",
      "severity": "low|medium|high"
    }}
  ],
  "corrections": ["short, actionable bullet points"],
  "notes": "any extra disambiguation"
}}
"""


def convert_audio_to_wav(input_path: Path) -> Path:
    """Convert audio file to WAV format for better compatibility with Gemini."""
    # Create a temporary WAV file
    temp_wav = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
    temp_wav.close()
    
    try:
        # Load audio file
        audio = AudioSegment.from_file(str(input_path))
        
        # Convert to WAV format (16kHz, mono, 16-bit for better compatibility)
        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        
        # Export as WAV
        audio.export(temp_wav.name, format="mp3")
        
        return Path(temp_wav.name)
    except Exception as e:
        # Clean up temp file if conversion fails
        os.unlink(temp_wav.name)
        raise Exception(f"Failed to convert audio to WAV: {e}")


def encode_audio_to_base64(audio_path: Path) -> str:
    """Read audio file and return base64 encoded string."""
    with open(audio_path, "rb") as audio_file:
        return base64.b64encode(audio_file.read()).decode("utf-8")


async def send_audio_via_gemini(audio_path: Path, prompt: str, api_key: str):
    """Send audio file using Gemini API for transcription and evaluation."""
    # Configure Gemini
    genai.configure(api_key=api_key)
    
    try:
        print(f"Processing audio file: {audio_path}")
        print(f"File size: {audio_path.stat().st_size} bytes")
        
        # Convert audio to WAV format
        print("Converting audio to WAV format...")
        wav_path = convert_audio_to_wav(audio_path)
        
        try:
            # Encode audio to base64
            print("Encoding audio to base64...")
            audio_base64 = encode_audio_to_base64(wav_path)
            
            # Create the model
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            # Prepare the content with audio and prompt
            content = [
                prompt,
                {
                    "mime_type": "audio/wav",
                    "data": audio_base64
                }
            ]
            
            print("Sending to Gemini for transcription and evaluation...")
            
            # Generate response
            response = model.generate_content(content)
            
            # Parse the JSON response
            response_text = response.text.strip()
            
            # Try to extract JSON from the response (in case there's extra text)
            if response_text.startswith('```json'):
                response_text = response_text[7:-3]  # Remove ```json and ```
            elif response_text.startswith('```'):
                response_text = response_text[3:-3]  # Remove ``` and ```
            
            result = json.loads(response_text)
            
            return result
            
        finally:
            # Clean up temporary WAV file
            if wav_path.exists():
                os.unlink(wav_path)
        
    except Exception as e:
        print(f"Error processing audio: {e}")
        raise


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_path", type=Path, help="Path to .m4a (or any audio) file")
    parser.add_argument("--icao", default="ICAO", help="ICAO or FAA (for phrasing rubric)")
    parser.add_argument("--phase", default="unspecified", help="Flight phase (e.g., taxi, departure, approach)")
    parser.add_argument("--callsign", default="unknown", help="Expected callsign, if known")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY is not set.", file=sys.stderr)
        sys.exit(2)

    if not args.audio_path.exists():
        print(f"ERROR: File not found: {args.audio_path}", file=sys.stderr)
        sys.exit(2)

    # Prepare inputs
    prompt = EVAL_PROMPT_TEMPLATE.format(
        icao_standard=args.icao,
        phase=args.phase,
        callsign=args.callsign
    )

    # Use Gemini API to process the audio
    try:
        result = await send_audio_via_gemini(args.audio_path, prompt, api_key)
        print(json.dumps(result, indent=2 if args.pretty else None))
    except Exception as e:
        print(f"ERROR: Failed to process audio: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
