import cv2
import numpy as np
import os

cropped_folder="data/cropped_persons"
red_shirt_frames = []

for file in os.listdir(cropped_folder):
    path=os.path.join(cropped_folder,file)
    image=cv2.imread(path)

    if image is None:
        continue

    height,width=image.shape[:2]
    if height < 100:
        continue

    shirt_region=image[
        height//4:int(height*0.65),
        width//4:int(width*0.75)
    ]

    hsv = cv2.cvtColor(shirt_region, cv2.COLOR_BGR2HSV)

    lower_red1=np.array([0,100,100])
    upper_red1=np.array([10,255,255])

    lower_red2=np.array([160,100,100])
    upper_red2=np.array([180,255,255])

    mask1=cv2.inRange(hsv,lower_red1,upper_red1)
    mask2=cv2.inRange(hsv,lower_red2,upper_red2)

    total_red=mask1+mask2
    red_pixels=cv2.countNonZero(total_red)

    total_pixels=shirt_region.shape[0]*shirt_region.shape[1]
    red_percentage=red_pixels/total_pixels

    if red_percentage>0.40:
        frame_number=int(file.split("_")[1])
        red_shirt_frames.append(frame_number)


print("\nMatched Frames:")
print(sorted(set(red_shirt_frames)))

with open("outputs/matched_frames.txt", "w") as f:
    for frame in sorted(set(red_shirt_frames)):
        f.write(str(frame) + "\n")

print(f"Saved {len(set(red_shirt_frames))} matched frames.")