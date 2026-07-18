"use client";

import { useState, useRef, useEffect } from "react";

type PredictResult = {
  predicted_label: string;
  prob_luad: number;
  prob_lusc: number;
  n_patches: number;
  thumbnail_base64?: string;
  heatmap_base64?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function makeSpecimenId() {
  const n = Math.floor(Math.random() * 90000) + 10000;
  return `WSI-${n}`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<PredictResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [specimenId, setSpecimenId] = useState(makeSpecimenId);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const overlayOpen = status === "loading" || status === "done";

  const handleFileSelect = (f: File | null) => {
    if (!f) return;
    const validExt = [".svs", ".tiff", ".tif"];
    const ok = validExt.some((ext) => f.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setErrorMsg("SVS 또는 TIFF 파일만 업로드할 수 있어요.");
      return;
    }
    setFile(f);
    setErrorMsg("");
    setResult(null);
    setStatus("idle");
  };

  const uploadWithProgress = (url: string, f: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadPct(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error("파일 업로드 실패"));
      xhr.onerror = () => reject(new Error("파일 업로드 실패"));
      xhr.send(f);
    });
  };

  const handleAnalyze = async () => {
    if (!file || !API_URL) return;
    setStatus("loading");
    setErrorMsg("");
    setUploadPct(0);
    setElapsedSec(0);
    setSpecimenId(makeSpecimenId());

    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const urlRes = await fetch(`${API_URL}/generate-upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!urlRes.ok) throw new Error("업로드 URL 발급 실패");
      const { upload_url, blob_path } = await urlRes.json();

      await uploadWithProgress(upload_url, file);
      setUploadPct(null);

      const predictRes = await fetch(`${API_URL}/predict-from-gcs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob_path, return_heatmap: true }),
      });

      clearInterval(timer);

      if (!predictRes.ok) {
        const detail = await predictRes.json().catch(() => null);
        throw new Error(detail?.detail || `요청 실패 (${predictRes.status})`);
      }
      const data: PredictResult = await predictRes.json();
      setResult(data);
      setStatus("done");
    } catch (e) {
      clearInterval(timer);
      setErrorMsg(
        e instanceof Error ? e.message : "알 수 없는 오류가 발생했어요.",
      );
      setStatus("error");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setResult(null);
    setFile(null);
  };

  const isUploading = uploadPct !== null && uploadPct < 100;

  return (
    <main className="min-h-screen relative flex flex-col items-center px-6 py-16 md:py-24">
      <div className="w-full max-w-lg relative z-10">
        {/* Eyebrow */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-hematoxylin" />
            <span className="h-1.5 w-1.5 rounded-full bg-eosin" />
          </div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
            Histopathology WSI Classifier
          </p>
        </div>

        {/* Header */}
        <h1 className="font-display text-[2rem] md:text-[2.5rem] font-semibold text-ink leading-[1.05] tracking-tight">
          폐암 조직 슬라이드 아형 분류
        </h1>
        <p className="mt-4 text-muted text-[15px] leading-relaxed max-w-md">
          SVS 슬라이드를 업로드하면 UNI2-h로 특징을 추출하고, TransMIL이 LUAD와
          LUSC 중 어느 쪽인지 판단해 어텐션 히트맵과 함께 보여줘요.
        </p>
        <a
          href="https://storage.googleapis.com/shining-lamp-492601-f9-wsi-models/sample/sample.svs"
          download
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-mono text-hematoxylin border-b border-hematoxylin/30 hover:border-hematoxylin transition-colors"
        >
          샘플 슬라이드 다운로드
        </a>

        {/* Divider with tick marks — microscope stage motif */}
        <div className="mt-10 mb-8 flex items-center gap-[3px]">
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              className={`h-2 w-px ${i % 5 === 0 ? "bg-ink/40 h-3" : "bg-border"}`}
            />
          ))}
        </div>

        {/* Upload zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFileSelect(e.dataTransfer.files?.[0] ?? null);
          }}
          className="group cursor-pointer border border-border bg-white px-8 py-14 text-center transition-colors hover:border-hematoxylin"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".svs,.tiff,.tif"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <p className="font-mono text-sm text-ink break-all">
                {file.name}
              </p>
              <p className="mt-2 text-xs text-muted">
                {(file.size / 1024 / 1024).toFixed(1)} MB · 다른 파일을
                선택하려면 클릭하세요
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] text-ink">
                슬라이드 파일을 끌어다 놓거나 클릭해서 선택하세요
              </p>
              <p className="mt-2 text-xs text-muted font-mono tracking-wide">
                .SVS &nbsp;·&nbsp; .TIFF &nbsp;·&nbsp; .TIF
              </p>
            </>
          )}
        </div>

        {errorMsg && <p className="mt-3 text-sm text-eosin">{errorMsg}</p>}

        <button
          onClick={handleAnalyze}
          disabled={!file}
          className="mt-4 w-full bg-ink py-4 font-medium text-paper text-[15px] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-25"
        >
          분석하기
        </button>
      </div>

      {/* Overlay: loading → result */}
      {overlayOpen && (
        <Overlay onClose={status === "done" ? handleReset : undefined}>
          {status === "loading" && (
            <LoadingCard isUploading={isUploading} elapsedSec={elapsedSec} />
          )}
          {status === "done" && result && (
            <ResultCard
              result={result}
              specimenId={specimenId}
              onReset={handleReset}
            />
          )}
        </Overlay>
      )}
    </main>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function LoadingCard({
  isUploading,
  elapsedSec,
}: {
  isUploading: boolean;
  elapsedSec: number;
}) {
  const mm = String(Math.floor(elapsedSec / 60)).padStart(1, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  return (
    <div className="border border-ink bg-ink text-paper px-8 py-10 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-eosin opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-eosin" />
          </span>
          <p className="text-sm font-medium">
            {isUploading ? "슬라이드 업로드 중" : "조직 분석 중"}
          </p>
        </div>
        <span className="font-mono text-xs text-paper/50 tabular-nums">
          {mm}:{ss}
        </span>
      </div>

      <div className="h-1.5 w-full bg-paper/15 overflow-hidden relative">
        <div className="absolute h-full w-1/3 bg-gradient-to-r from-transparent via-eosin to-transparent scan-bar" />
      </div>

      <p className="mt-4 text-xs text-paper/50 leading-relaxed">
        {isUploading
          ? "슬라이드 원본을 서버로 전송하고 있어요."
          : "UNI2-h로 패치 특징을 추출하고 TransMIL로 예측하는 중이에요."}
        <br />
        {!isUploading && "슬라이드 크기에 따라 1~3분 정도 걸릴 수 있어요."}
      </p>
    </div>
  );
}

function ResultCard({
  result,
  specimenId,
  onReset,
}: {
  result: PredictResult;
  specimenId: string;
  onReset: () => void;
}) {
  const isLuad = result.predicted_label?.includes("LUAD");
  const luadPct = Math.round(result.prob_luad * 1000) / 10;
  const luscPct = Math.round(result.prob_lusc * 1000) / 10;

  return (
    <div className="border border-border bg-white shadow-2xl animate-[fadeIn_0.3s_ease-out]">
      <div className="flex items-center justify-between border-b border-border px-6 py-3.5">
        <span className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
          Specimen {specimenId}
        </span>
        <span className="font-mono text-[11px] text-muted">
          {result.n_patches.toLocaleString()} patches
        </span>
      </div>

      <div className="px-6 py-7">
        <p className="font-mono text-[11px] text-muted uppercase tracking-[0.15em] mb-2">
          Predicted subtype
        </p>
        <p
          className={`font-display text-5xl font-semibold ${
            isLuad ? "text-hematoxylin" : "text-eosin"
          }`}
        >
          {isLuad ? "LUAD" : "LUSC"}
        </p>

        <div className="mt-8 space-y-4">
          <ProbRow label="LUAD" pct={luadPct} color="bg-hematoxylin" />
          <ProbRow label="LUSC" pct={luscPct} color="bg-eosin" />
        </div>
      </div>

      {(result.thumbnail_base64 || result.heatmap_base64) && (
        <div className="border-t border-border px-6 py-7">
          <p className="font-mono text-[11px] text-muted uppercase tracking-[0.15em] mb-3">
            Original / Attention heatmap
          </p>
          <div className="grid grid-cols-2 gap-px bg-border">
            {result.thumbnail_base64 && (
              <img
                src={result.thumbnail_base64}
                alt="원본 슬라이드"
                className="w-full bg-white"
              />
            )}
            {result.heatmap_base64 && (
              <img
                src={result.heatmap_base64}
                alt="어텐션 히트맵"
                className="w-full bg-white"
              />
            )}
          </div>
        </div>
      )}

      <div className="border-t border-border px-6 py-4">
        <button
          onClick={onReset}
          className="w-full bg-ink py-3 font-medium text-paper text-sm transition-opacity hover:opacity-85"
        >
          다른 슬라이드 분석하기
        </button>
      </div>
    </div>
  );
}

function ProbRow({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-10 font-mono text-xs text-muted">{label}</span>
      <div className="flex-1 h-1.5 bg-paperAlt overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-right font-mono text-xs text-ink">{pct}%</span>
    </div>
  );
}
