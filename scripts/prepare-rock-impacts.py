"""Build short rock-hit WAVs from the loud middle bursts of the supplied MP3s.

Run with Python 3 and VLC installed: py scripts/prepare-rock-impacts.py
Use --vlc PATH if VLC is not on PATH or in its usual Windows location.
The source MP3s are preserved; decoded intermediates go in .cache/audio.
"""

import argparse
import array
import math
from pathlib import Path
import shutil
import subprocess
import sys
import wave


ROOT = Path(__file__).resolve().parents[1]
DURATION = 0.48


def read_pcm(path):
    with wave.open(str(path), "rb") as sound:
        assert sound.getnchannels() == 1 and sound.getsampwidth() == 2
        rate = sound.getframerate()
        samples = array.array("h", sound.readframes(sound.getnframes()))
    if sys.byteorder != "little":
        samples.byteswap()
    return rate, samples


def trim_impact(rate, samples):
    # Find the loudest 20 ms within the central 40% of the recording.
    window = round(rate * 0.02)
    peak = max(
        range(round(len(samples) * 0.3), round(len(samples) * 0.7) - window, window),
        key=lambda start: sum(x * x for x in samples[start:start + window]),
    )
    # Start just before that transient, discarding the original long swell.
    start = max(0, peak - round(rate * 0.015))
    raw = samples[start:start + round(rate * DURATION)]
    dc = sum(raw) / len(raw)
    shaped = []
    for i, sample in enumerate(raw):
        time = i / rate
        remaining = (len(raw) - 1 - i) / rate
        attack = math.sin(min(1, time / 0.003) * math.pi / 2) ** 2
        release = math.sin(min(1, remaining / 0.07) * math.pi / 2) ** 2
        decay = math.exp(-7 * max(0, time - 0.04))
        shaped.append((sample - dc) / 32768 * attack * release * decay)
    # Match average energy between variants, with headroom for overlapping hits.
    rms = math.sqrt(sum(x * x for x in shaped) / len(shaped))
    scale = min(0.16 / rms, 0.85 / max(abs(x) for x in shaped))
    pcm = array.array("h", (round(x * scale * 32767) for x in shaped))
    return start / rate, pcm


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vlc", default=shutil.which("vlc") or r"C:\Program Files\VideoLAN\VLC\vlc.exe")
    args = parser.parse_args()
    if not Path(args.vlc).is_file():
        parser.error("VLC was not found; supply its executable with --vlc PATH")
    temp = ROOT / ".cache" / "audio"
    temp.mkdir(parents=True, exist_ok=True)
    for number in (1, 2):
        source = ROOT / "public" / f"rock-impact-{number}.mp3"
        decoded = Path(temp) / f"impact-{number}.wav"
        subprocess.run([
            args.vlc, "--intf", "dummy", "--no-one-instance", "--no-video",
            "--no-metadata-network-access", str(source), "--sout",
            f"#transcode{{acodec=s16l,channels=1,samplerate=44100}}:std{{access=file,mux=wav,dst={decoded}}}",
            "vlc://quit",
        ], check=True, capture_output=True, timeout=30,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        rate, samples = read_pcm(decoded)
        start, pcm = trim_impact(rate, samples)
        output = ROOT / "public" / f"rock-hit-{number}.wav"
        peak = max(abs(x) for x in pcm) / 32768
        rms = math.sqrt(sum(x * x for x in pcm) / len(pcm)) / 32768
        if sys.byteorder != "little":
            pcm.byteswap()
        with wave.open(str(output), "wb") as sound:
            sound.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            sound.writeframes(pcm.tobytes())
        print(f"{source.name}: {len(samples) / rate:.3f}s source; "
              f"using {start:.3f}-{start + len(pcm) / rate:.3f}s -> {output.name}; "
              f"{len(pcm) / rate:.3f}s, peak {peak:.3f}, RMS {rms:.3f}")


if __name__ == "__main__":
    main()
