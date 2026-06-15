![Python](https://img.shields.io/badge/Python-3.10+-blue)
![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-green)
![CLIP](https://img.shields.io/badge/CLIP-OpenAI-orange)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![License](https://img.shields.io/badge/License-MIT-yellow)

# PersonFinder AI

**Attribute-Based Person Retrieval from Surveillance Videos using YOLOv8 and Vision-Language Models**

PersonFinder AI is a full-stack AI system that enables users to locate specific individuals in surveillance footage using natural language attributes instead of manually reviewing hours of video.

Upload a video, describe a target person (e.g., *"yellow shirt, pink handbag, black shorts"*), and the system automatically detects people, extracts attributes, ranks matches, and returns timestamped results with confidence scores.

---

## Demo Workflow

```text
Upload Video
      ↓
Person Detection (YOLOv8)
      ↓
Person Cropping
      ↓
Attribute Extraction
      ↓
CLIP-based Similarity Matching
      ↓
Confidence Scoring & Ranking
      ↓
Timestamped Results Dashboard
```

---

## Key Features

### Intelligent Person Search

* Search using natural language attributes
* Multi-attribute matching
* Priority-based attribute weighting
* Confidence-based ranking

### Video Analytics

* Automatic frame sampling
* Real-time processing progress
* Timestamp localization
* Person crop generation

### AI-Powered Retrieval

* YOLOv8 person detection
* OpenAI CLIP attribute understanding
* HSV-based color verification
* Weighted confidence scoring

### Modern User Experience

* Next.js frontend
* Real-time SSE progress updates
* Interactive results dashboard
* Dark-themed responsive UI

---

## System Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    Next.js Frontend                     │
│                                                         │
│  Upload Video  →  Attributes  →  Results Dashboard     │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Node.js Backend                        │
│                                                         │
│  Express API                                            │
│  File Upload Handling                                   │
│  Job Management                                         │
│  SSE Progress Streaming                                 │
│  Python Process Orchestration                           │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Python AI Pipeline                     │
│                                                         │
│  Video Processing                                       │
│  Frame Sampling                                         │
│  YOLOv8 Person Detection                                │
│  Person Cropping                                        │
│  Attribute Extraction                                   │
│  CLIP Similarity Matching                               │
│  Confidence Scoring                                     │
│  Result Generation                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend

* Next.js
* TypeScript
* Tailwind CSS

### Backend

* Node.js
* Express.js
* Multer
* Server-Sent Events (SSE)

### AI & Computer Vision

* YOLOv8
* OpenAI CLIP
* OpenCV
* PyTorch
* NumPy

---

## Retrieval Pipeline

### Step 1 — Video Processing

Video is sampled at configurable intervals to reduce computational cost while maintaining retrieval quality.

### Step 2 — Person Detection

YOLOv8 identifies all visible persons in each sampled frame.

### Step 3 — Person Cropping

Detected persons are cropped into individual images for attribute analysis.

### Step 4 — Attribute Matching

Each crop is evaluated against user-provided attributes.

Example:

```text
yellow shirt
pink handbag
black shorts
```

CLIP computes semantic similarity between the image crop and textual descriptions.

### Step 5 — Confidence Scoring

Each attribute receives an individual score.

```text
yellow shirt  → 96%
pink handbag  → 88%
black shorts  → 91%
```

Scores are combined using priority-based weighting.

### Step 6 — Ranking

All detected persons are ranked according to final confidence score.

Top matches are returned with:

* Timestamp
* Frame number
* Confidence score
* Cropped image

---

## Example Query

Input:

```text
yellow shirt (High)
pink handbag (High)
black shorts (Medium)
```

Output:

```text
Match #1
Confidence: 96%
Timestamp: 00:07

Match #2
Confidence: 95%
Timestamp: 00:08
```

---

## Project Structure

```text
VIDEO_AI/

├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│
├── backend/
│   ├── server.js
│   ├── uploads/
│   └── outputs/
│
├── python/
│   ├── src/
│   │   └── pipeline.py
│   └── requirements.txt
│
└── README.md
```

---

## Installation

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run dev
```

### Python

```bash
cd python

pip install -r requirements.txt

pip install git+https://github.com/openai/CLIP.git
```

---

## Future Improvements

* DeepSORT-based person tracking
* Duplicate result suppression
* Face-aware retrieval
* Temporal clustering
* Cross-camera retrieval
* Natural language query expansion
* GPU optimization

---

## Results

The system successfully retrieves target individuals from surveillance footage using visual attributes and returns ranked timestamped matches through an interactive dashboard.

Current implementation supports:

* Multi-attribute retrieval
* Confidence-based ranking
* Real-time progress monitoring
* Full-stack deployment architecture

---

## Author

Pragati Yadav

IIT Roorkee
