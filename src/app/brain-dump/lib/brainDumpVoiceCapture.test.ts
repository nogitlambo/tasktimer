import { describe, expect, it } from "vitest";

import { encodeVoiceWav, hasDetectableVoiceSignal } from "./brainDumpVoiceCapture";

function sineWave(sampleRate: number, seconds: number, amplitude = 0.25) {
  return Float32Array.from({ length: sampleRate * seconds }, (_, index) =>
    Math.sin((index / sampleRate) * Math.PI * 2 * 440) * amplitude
  );
}

describe("Brain Dump voice capture", () => {
  it.each([44_100, 48_000])("encodes %s Hz input as valid 16 kHz mono PCM WAV", async (sourceSampleRate) => {
    const blob = encodeVoiceWav([sineWave(sourceSampleRate, 1)], sourceSampleRate);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(new TextDecoder().decode(bytes.slice(36, 40))).toBe("data");
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(32_000);
    expect(blob.type).toBe("audio/wav");
  });

  it("distinguishes usable speech-level samples from silence and near-silence", () => {
    expect(hasDetectableVoiceSignal([sineWave(48_000, 1)])).toBe(true);
    expect(hasDetectableVoiceSignal([new Float32Array(48_000)])).toBe(false);
    expect(hasDetectableVoiceSignal([sineWave(48_000, 1, 0.0001)])).toBe(false);
  });

  it("joins captured chunks without adding paused gaps", async () => {
    const blob = encodeVoiceWav([sineWave(48_000, 1), sineWave(48_000, 1)], 48_000);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(bytes.byteLength).toBe(44 + 2 * 16_000 * 2);
  });
});
