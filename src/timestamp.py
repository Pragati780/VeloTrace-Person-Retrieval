import cv2

path="data/input/input_video.mp4"
video=cv2.VideoCapture(path)
fps=video.get(cv2.CAP_PROP_FPS)
video.release()

matched_frames=[]

with open("outputs/matched_frames.txt","r") as f:
    for line in f:
        matched_frames.append(int(line.strip()))

if not matched_frames:
    print("No matches found")
    exit()

intervals=[]

start=matched_frames[0]
prev=matched_frames[0]
for frame in matched_frames[1:]:
    if frame-prev<=20:
        prev=frame

    else:
        intervals.append((start,prev))
        start=frame
        prev=frame

intervals.append((start,prev))
print("\nRed Shirt Detected At:\n")
for start_frame, end_frame in intervals:

    start_time=start_frame/fps
    end_time=end_frame/fps

    print(
        f"{start_time:.2f}s-{end_time:.2f}s"
    )