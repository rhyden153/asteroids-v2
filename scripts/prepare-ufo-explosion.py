"""Trim silence and balance the UFO explosion recording for the game.

Run: py scripts/prepare-ufo-explosion.py [--vlc PATH]
Requires Python 3 and VLC. The original MP3 is preserved.
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vlc", default=shutil.which("vlc") or r"C:\Program Files\VideoLAN\VLC\vlc.exe")
    args = parser.parse_args()
    if not Path(args.vlc).is_file():
        parser.error("VLC was not found; supply its executable with --vlc PATH")
    decoded = ROOT / ".cache" / "audio" / "ufo-source.wav"
    decoded.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        args.vlc, "--intf", "dummy", "--no-one-instance", "--no-video",
        "--no-metadata-network-access", str(ROOT / "public" / "ufo-explosion.mp3"),
        "--sout", f"#transcode{{acodec=s16l,channels=1,samplerate=44100}}:std{{access=file,mux=wav,dst={decoded}}}",
        "vlc://quit",
    ], check=True, capture_output=True, timeout=30,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    with wave.open(str(decoded), "rb") as sound:
        assert sound.getnchannels() == 1 and sound.getsampwidth() == 2
        rate = sound.getframerate()
        samples = array.array("h", sound.readframes(sound.getnframes()))
    if sys.byteorder != "little":
        samples.byteswap()
    # Trim the quiet padding, retaining a little space before the attack and after the tail.
    hop = round(rate * 0.01)
    energy = [math.sqrt(sum(x * x for x in samples[i:i + hop]) / len(samples[i:i + hop]))
              for i in range(0, len(samples), hop)]
    threshold = max(energy) * 0.025
    audible = [i for i, rms in enumerate(energy) if rms > threshold]
    if not audible:
        parser.error("The input recording contains no audible explosion")
    start = max(0, audible[0] * hop - round(rate * 0.005))
    end = min(len(samples), (audible[-1] + 1) * hop + round(rate * 0.04))
    raw = samples[start:end]
    dc = sum(raw) / len(raw)
    shaped = []
    for i, sample in enumerate(raw):
        attack = math.sin(min(1, i / rate / 0.003) * math.pi / 2) ** 2
        release = math.sin(min(1, (len(raw) - 1 - i) / rate / 0.06) * math.pi / 2) ** 2
        shaped.append((sample - dc) / 32768 * attack * release)
    rms = math.sqrt(sum(x * x for x in shaped) / len(shaped))
    scale = min(0.20 / rms, 0.85 / max(abs(x) for x in shaped))
    pcm = array.array("h", (round(x * scale * 32767) for x in shaped))
    if sys.byteorder != "little":
        pcm.byteswap()
    output = ROOT / "public" / "ufo-burst.wav"
    with wave.open(str(output), "wb") as sound:
        sound.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        sound.writeframes(pcm.tobytes())
    print(f"ufo-explosion.mp3: {len(samples) / rate:.3f}s source; "
          f"using {start / rate:.3f}-{end / rate:.3f}s -> {output.name}; "
          f"{len(pcm) / rate:.3f}s, RMS {rms * scale:.3f}")


if __name__ == "__main__":
    main()
