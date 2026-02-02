#!/bin/bash
# Convert all M4A files in the current directory to MP3

for file in *.m4a; do
    if [ -f "$file" ]; then
        echo "Converting $file to ${file%.m4a}.mp3"
        ffmpeg -i "$file" -codec:a libmp3lame -b:a 192k "${file%.m4a}.mp3"
    fi
done

echo "Conversion complete!"
