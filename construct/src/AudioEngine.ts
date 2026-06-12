import { Howl, Howler } from 'howler';

class AudioEngine {
  private ambientDrone: Howl | null = null;
  private clickSound: Howl;
  private alertSound: Howl;
  private muted = false;

  constructor() {
    this.clickSound = new Howl({
      src: ['data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='],
      volume: 0.5
    });

    this.alertSound = new Howl({
      src: ['data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='],
      volume: 0.8
    });
  }

  public playAmbient() {
    if (!this.ambientDrone) {
      this.ambientDrone = new Howl({
        src: ['data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='],
        loop: true,
        volume: 0.3
      });
      this.ambientDrone.play();
    }
  }

  public stopAmbient() {
    if (this.ambientDrone) {
      this.ambientDrone.stop();
      this.ambientDrone = null;
    }
  }

  public playClick() {
    this.clickSound.play();
  }

  public playAlert() {
    this.alertSound.play();
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    Howler.mute(muted);
    if (muted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public speakTTS(message: string) {
    if (this.muted) return;
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 1.0;
      utterance.pitch = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  }
}

export const audio = new AudioEngine();
export default audio;
