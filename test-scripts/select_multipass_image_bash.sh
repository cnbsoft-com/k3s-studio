#!/bin/bash

# ==============================================================================
# Script Name: select_multpass_image.sh
# Description: Runs 'multipass find', filters Ubuntu images, and provides a selection menu.
# ==============================================================================

# Use 'multipass' (corrected from typo 'mutilapss')
CMD="multipass"

# Check if multipass is installed
if ! command -v "$CMD" &> /dev/null; then
    echo "❌ Error: '$CMD' command not found. Please ensure Multipass is installed."
    exit 1
fi

echo "🔍 Fetching available images from $CMD..."

# Filter lines that contain "Ubuntu"
# We store them in an array. Using a loop for compatibility with older bash versions.
IMAGES=()
while IFS= read -r line; do
    # Only include lines where the description contains "Ubuntu"
    if [[ "$line" == *"Ubuntu"* ]]; then
        IMAGES+=("$line")
    fi
done < <($CMD find)

# Check if we found any images
if [ ${#IMAGES[@]} -eq 0 ]; then
    echo "❌ No Ubuntu images found."
    exit 1
fi

echo ""
echo "📋 Available Ubuntu Images:"
echo "--------------------------------------------------------------------------------"
# Print header for reference
$CMD find | head -n 1
echo "--------------------------------------------------------------------------------"

# Set prompt for selection
PS3="
👉 Select an image number (or 'q' to quit): "

# Provide selection menu
select choice in "${IMAGES[@]}"; do
    if [[ "$REPLY" == "q" ]]; then
        echo "👋 Exiting..."
        exit 0
    elif [ -n "$choice" ]; then
        # Extract the first column (Image/Alias) as the selected image name
        IMAGE_NAME=$(echo "$choice" | awk '{print $1}')
        
        echo ""
        echo "✅ Selection Confirmed!"
        echo "------------------------------------------------"
        echo "Selected Image: $IMAGE_NAME"
        echo "Full Detail   : $choice"
        echo "------------------------------------------------"
        
        # You can add further logic here, like:
        # multipass launch "$IMAGE_NAME"
        
        break
    else
        echo "⚠️  Invalid selection. Please enter a number from the list above."
    fi
done
