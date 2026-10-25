"use client";

import { headPose } from "./duration-tracker";

const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface FaceFrame {
  faces: number;
  yaw: number | null;
  pitch: number | null;
  /** Head turned away or eyes looking hard to one side. */
  gazeAway: boolean;
  gazeScore: number;
}

type Landmarker = Awaited<ReturnType<typeof import("@mediapipe/tasks-vision").FaceLandmarker.createFromOptions>>;

/** MediaPipe Face Landmarker (Apache-2.0): face count, head pose and eye-look blendshapes. */
export class FaceTracker {
  private constructor(private readonly lm: Landmarker) {}

  static async create(): Promise<FaceTracker> {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/vendor/mediapipe/wasm");
    const opts = {
      runningMode: "VIDEO" as const,
      numFaces: 4,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    };
    try {
      return new FaceTracker(await FaceLandmarker.createFromOptions(fileset, { ...opts, baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" } }));
    } catch {
      return new FaceTracker(await FaceLandmarker.createFromOptions(fileset, { ...opts, baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" } }));
    }
  }

  detect(video: HTMLVideoElement, nowMs: number): FaceFrame | null {
    if (video.readyState < 2 || !video.videoWidth) return null;
    const r = this.lm.detectForVideo(video, nowMs);
    const faces = r.faceLandmarks.length;
    if (!faces) return { faces: 0, yaw: null, pitch: null, gazeAway: false, gazeScore: 0 };
    const matrix = r.facialTransformationMatrixes?.[0]?.data;
    const pose = matrix ? headPose(matrix) : { yaw: 0, pitch: 0 };
    const shapes = Object.fromEntries((r.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
    const look = (a: string, b: string) => ((shapes[a] ?? 0) + (shapes[b] ?? 0)) / 2;
    // Both eyes agreeing on a direction: left = outLeft+inRight, right = inLeft+outRight.
    const eyes = Math.max(look("eyeLookOutLeft", "eyeLookInRight"), look("eyeLookInLeft", "eyeLookOutRight"), look("eyeLookUpLeft", "eyeLookUpRight"), look("eyeLookDownLeft", "eyeLookDownRight") * 0.8);
    const headAway = Math.abs(pose.yaw) > 30 || Math.abs(pose.pitch) > 25;
    return { faces, yaw: Math.round(pose.yaw), pitch: Math.round(pose.pitch), gazeAway: headAway || eyes > 0.7, gazeScore: Math.round(Math.max(eyes, headAway ? 1 : 0) * 100) / 100 };
  }

  close() {
    this.lm.close();
  }
}

export interface ObjectFrame {
  phones: number;
  books: number;
  persons: number;
  laptops: number;
  best: { phone: number; book: number; person: number };
}

type CocoModel = Awaited<ReturnType<typeof import("@tensorflow-models/coco-ssd").load>>;

/** TF.js COCO-SSD (Apache-2.0, lite MobileNet) for phones, books and extra people. */
export class ObjectTracker {
  private constructor(private readonly model: CocoModel) {}

  static async create(): Promise<ObjectTracker> {
    const tf = await import("@tensorflow/tfjs");
    await tf.ready();
    const coco = await import("@tensorflow-models/coco-ssd");
    return new ObjectTracker(await coco.load({ base: "lite_mobilenet_v2" }));
  }

  async detect(video: HTMLVideoElement): Promise<ObjectFrame | null> {
    if (video.readyState < 2 || !video.videoWidth) return null;
    const preds = await this.model.detect(video, 10, 0.45);
    const of = (cls: string, min: number) => preds.filter((p) => p.class === cls && p.score >= min);
    const best = (cls: string) => Math.max(0, ...preds.filter((p) => p.class === cls).map((p) => p.score));
    return {
      phones: of("cell phone", 0.5).length,
      books: of("book", 0.6).length,
      persons: of("person", 0.6).length,
      laptops: of("laptop", 0.6).length,
      best: { phone: best("cell phone"), book: best("book"), person: best("person") },
    };
  }
}

/** Small JPEG of the current frame for evidence (≈20–60 KB). */
export function snapshot(video: HTMLVideoElement, width = 480): string | undefined {
  if (!video.videoWidth) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.6);
}

/** Mean luma of a downscaled frame (camera covered / black feed detection). */
export function frameLuma(video: HTMLVideoElement, canvas: HTMLCanvasElement): number | null {
  if (!video.videoWidth) return null;
  canvas.width = 64;
  canvas.height = 36;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, 64, 36);
  const { data } = ctx.getImageData(0, 0, 64, 36);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / 4);
}
