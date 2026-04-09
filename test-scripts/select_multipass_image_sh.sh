#!/bin/sh
set -e

# ==============================================================================
# Script Name: select_multpass_image.sh
# Description: Runs 'multipass find', filters Ubuntu images, and provides a selection menu.
# This version is compatible with POSIX /bin/sh.
# ==============================================================================

CMD="multipass"

set image_version
set image_description

# Check if multipass is installed
if ! command -v "$CMD" > /dev/null 2>&1; then
    echo "❌ Error: '$CMD' command not found. Please ensure Multipass is installed."
    exit 1
fi

echo "🔍 Fetching available images from $CMD..."

# Create a temporary file to store filtered images
# TMP_IMAGES=$(mktemp)
# echo "TMP_IMAGES is $TMP_IMAGES"
# trap 'rm -f "$TMP_IMAGES"' EXIT

# Filter lines that contain "Ubuntu" and store to temporary file
# $CMD find | grep "Ubuntu" > "$TMP_IMAGES"

# Check if we found any images (if temporary file size is 0)
# if [ ! -s "$TMP_IMAGES" ]; then
#     echo "❌ No Ubuntu images found."
#     exit 1
# fi

echo ""
echo "📋 Available Ubuntu Images:"
echo "--------------------------------------------------------------------------------"
# Print header for reference
echo "No "$CMD find | head -n 1
echo "--------------------------------------------------------------------------------"

# Number the images and display them
# Using cat -n for simple numbering
# cat -n "$TMP_IMAGES"
INDEX=1
$CMD find | grep "Ubuntu" | while read -r line; do
    echo "$INDEX) $line"
    INDEX=$((INDEX + 1))
done

echo "--------------------------------------------------------------------------------"

# Manual selection loop
while :; do
    printf "\n👉 Select an image number (or 'q' to quit): "
    read -r reply

    # Handle quit
    case "$reply" in
        q|Q)
            echo "👋 Exiting..."
            exit 0
            ;;
    esac

    choice=""

    # Check if input is a number
    if echo "$reply" | grep -q '^[0-9]\{1,\}$'; then
        # Extract the line corresponding to the choice
        # choice=$(sed -n "${reply}p" "$TMP_IMAGES")
        INDEX=1
        
        $CMD find | grep "Ubuntu" | while read -r line; do
            if [ "$reply" -eq "$INDEX" ]; then
                echo "reply is $reply"
                echo "INDEX is $INDEX"
                echo "line is $line"
                image_version="$line"
                echo "###image_version is $image_version"
                # IMAGE_NAME=$(echo "$choice" | awk '{print $1}')
                break
            fi
            INDEX=$((INDEX + 1))
        done

        echo "image_version is $image_version"
        # echo "IMAGE_NAME is $IMAGE_NAME"
        
        if [ -n "$image_version" ]; then
            echo ""
            echo "✅ Selection Confirmed!"
            echo "------------------------------------------------"
            echo "Selected Image: $(awk '{print $1}' <<< $choice)"
            echo "Full Detail   : $choice"
            echo "------------------------------------------------"
            
            # Logic for further actions can be added here
            break
        else
            echo "⚠️  Invalid selection. Please enter a number from the list above."
        fi
    else
        echo "⚠️  Invalid input. Please enter a valid number or 'q'."
    fi
done
