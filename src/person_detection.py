from ultralytics import YOLO
import cv2
import os

model=YOLO("yolov8n.pt")

fr_folder="data/extracted_frames"
output_folder="data/cropped_persons"

os.makedirs(output_folder, exist_ok=True)

for i in sorted(os.listdir(fr_folder)):
    path=os.path.join(fr_folder,i)
    image=cv2.imread(path)
    if image is None:
        continue
    result=model(image)

    person=0
    for p in result:
        boxes = p.boxes
        for box in boxes:
            class_id=int(box.cls[0])
            if class_id == 0:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confidence = float(box.conf[0])
                if confidence < 0.75:
                    continue
                person_crop = image[y1:y2, x1:x2]
                output_path = os.path.join(
                    output_folder,
                    f"{os.path.splitext(i)[0]}_person_{person}.jpg"
                )
                cv2.imwrite(output_path, person_crop)
                person+= 1