// Log-spaced mapping from FFT bins to display bars.
// Linear bin indices bunch everything into the left few pixels; a log map
// spreads low/mid/high across the whole display, which is how real
// spectrum analyzers look.

export function buildLogMap(barCount, binCount, hzPerBin, fMin = 32, fMax = 15800) {
  const starts = new Int32Array(barCount);
  const ends = new Int32Array(barCount);
  const nyquist = hzPerBin * binCount;
  const top = Math.min(fMax, nyquist * 0.92);
  for (let i = 0; i < barCount; i++) {
    const f0 = fMin * Math.pow(top / fMin, i / barCount);
    const f1 = fMin * Math.pow(top / fMin, (i + 1) / barCount);
    const b0 = Math.max(1, Math.floor(f0 / hzPerBin));
    const b1 = Math.min(binCount, Math.max(b0 + 1, Math.ceil(f1 / hzPerBin)));
    starts[i] = b0;
    ends[i] = b1;
  }
  return { starts, ends };
}

// Narrow bands (bass, few bins per bar): the peak bin IS the partial — max
// reads it directly. Wide bands (high frequencies, many sparse bins): a max
// read latches onto noise spikes and makes bars creep upward with frequency,
// so those use an energy (RMS) average blended with the peak — local structure
// (note bumps) survives, the noise ratchet does not. The 1.3 gain keeps
// wide-band levels comparable to narrow-band peaks.
export function barValue(freq, b0, b1) {
  const span = b1 - b0;
  if (span <= 5) {
    let m = 0;
    for (let i = b0; i < b1; i++) if (freq[i] > m) m = freq[i];
    return m / 255;
  }
  const step = Math.max(1, Math.floor(span / 10));
  let sumSq = 0;
  let peak = 0;
  let n = 0;
  for (let i = b0; i < b1; i += step) {
    const v = freq[i];
    sumSq += v * v;
    if (v > peak) peak = v;
    n++;
  }
  const rms = Math.sqrt(sumSq / n);
  return (rms * 0.62 + peak * 0.38) * 1.3 / 255;
}
