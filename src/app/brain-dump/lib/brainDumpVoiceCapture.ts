const TARGET_SAMPLE_RATE = 16_000;
const WAV_MIME_TYPE = "audio/wav";

export function hasDetectableVoiceSignal(chunks: Float32Array[]) {
  let sampleCount = 0;
  let squaredTotal = 0;
  let peak = 0;
  for (const chunk of chunks) {
    for (const rawSample of chunk) {
      const sample = Number.isFinite(rawSample) ? Math.max(-1, Math.min(1, rawSample)) : 0;
      const magnitude = Math.abs(sample);
      peak = Math.max(peak, magnitude);
      squaredTotal += sample * sample;
      sampleCount += 1;
    }
  }
  if (!sampleCount) return false;
  const rms = Math.sqrt(squaredTotal / sampleCount);
  return peak >= 0.005 && rms >= 0.0015;
}

export function encodeVoiceWav(chunks: Float32Array[], sourceSampleRate: number) {
  const sourceLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const source = new Float32Array(sourceLength);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk, offset);
    offset += chunk.length;
  }
  const normalizedSourceRate = Math.max(1, Math.floor(sourceSampleRate) || TARGET_SAMPLE_RATE);
  const sampleRate = Math.min(TARGET_SAMPLE_RATE, normalizedSourceRate);
  const sampleCount = Math.ceil((source.length * sampleRate) / normalizedSourceRate);
  const bytes = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(bytes);
  const writeText = (position: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(position + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const sourceIndex = Math.min(source.length - 1, Math.floor((index * normalizedSourceRate) / sampleRate));
    const sample = Math.max(-1, Math.min(1, source[sourceIndex] || 0));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([bytes], { type: WAV_MIME_TYPE });
}
