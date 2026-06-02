import cv2
import os

path="data/input/input_video.mp4"

output_folder="data/extracted_frames"
os.makedirs(output_folder,exist_ok=True)

video=cv2.VideoCapture(path)

fps=video.get(cv2.CAP_PROP_FPS)
total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))

fn=0
srt=10

while True:
    success, frame= video.read()
    if not success:
        break
    if fn%srt==0:
        frame_path = os.path.join(
            output_folder,
            f"frame_{fn}.jpg"
        )
        cv2.imwrite(frame_path, frame)
    fn+=1
video.release()