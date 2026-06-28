import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { environment } from '../environments/environment';
import { VisionService } from './vision.service';

@Component({
  selector: 'vc-root',
  standalone: true,
  imports: [NgClass, DatePipe, DecimalPipe],
  template: `
    <header>
      <h1>VisioCheck</h1>
      <span class="status" [ngClass]="vision.connected() ? 'on' : 'off'">
        {{ vision.connected() ? 'connecté' : 'déconnecté' }}
      </span>
      @if (vision.lastInferMs() > 0) {
        <span class="metric">détection {{ vision.lastInferMs() | number: '1.0-0' }} ms</span>
      }
      <button (click)="toggle()">{{ running() ? 'Arrêter' : 'Démarrer' }}</button>
    </header>

    <main>
      <section class="stage">
        <video #video autoplay playsinline muted></video>
        <canvas #overlay></canvas>
        @if (errorMsg()) {
          <div class="error">{{ errorMsg() }}</div>
        }
      </section>

      <aside class="feed">
        <h2>Événements & description</h2>
        @for (item of vision.feed(); track item.id) {
          <article [ngClass]="item.kind">
            <div class="meta">
              <span class="tag">{{ item.label }}</span>
              <time>{{ item.atMs | date: 'HH:mm:ss' }}</time>
            </div>
            <p>{{ item.text }}</p>
          </article>
        } @empty {
          <p class="empty">En attente d'activité…</p>
        }
      </aside>
    </main>
  `,
  styles: [
    `
      :host { display: block; font-family: system-ui, sans-serif; color: #e6e6e6; background: #14171c; min-height: 100vh; }
      header { display: flex; align-items: center; gap: 1rem; padding: .75rem 1.25rem; background: #1c2128; border-bottom: 1px solid #2b323c; }
      h1 { font-size: 1.15rem; margin: 0; }
      .status { font-size: .8rem; padding: .15rem .5rem; border-radius: 999px; }
      .status.on { background: #15391f; color: #5ad17f; }
      .status.off { background: #3a1f1f; color: #e08a8a; }
      .metric { font-size: .8rem; color: #8b97a7; }
      header button { margin-left: auto; background: #2f7de1; color: #fff; border: 0; padding: .45rem 1rem; border-radius: 6px; cursor: pointer; }
      main { display: grid; grid-template-columns: 1fr 340px; gap: 1rem; padding: 1rem 1.25rem; }
      .stage { position: relative; background: #000; border-radius: 8px; overflow: hidden; aspect-ratio: 16/9; }
      video, canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
      .error { position: absolute; inset: auto 0 0 0; padding: .5rem; background: #5a1f1f; font-size: .85rem; }
      .feed { background: #1c2128; border-radius: 8px; padding: .75rem; max-height: 80vh; overflow-y: auto; }
      .feed h2 { font-size: .95rem; margin: .25rem 0 .75rem; }
      article { border-left: 3px solid #2f7de1; padding: .4rem .6rem; margin-bottom: .5rem; background: #232a33; border-radius: 4px; }
      article.event { border-left-color: #e0a73a; }
      article p { margin: .25rem 0 0; font-size: .9rem; }
      .meta { display: flex; justify-content: space-between; font-size: .72rem; color: #8b97a7; }
      .tag { font-weight: 600; }
      .empty { color: #8b97a7; font-size: .85rem; }
    `,
  ],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  readonly vision = inject(VisionService);

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly overlay = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');

  readonly running = signal(false);
  readonly errorMsg = signal('');

  private stream?: MediaStream;
  private captureTimer?: number;
  private frameId = 0;
  private readonly sendCanvas = document.createElement('canvas');

  constructor() {
    // Redessine l'overlay dès qu'une nouvelle analyse arrive.
    effect(() => {
      const dets = this.vision.detections();
      this.drawOverlay(dets);
    });
  }

  ngAfterViewInit(): void {
    this.vision.connect();
  }

  ngOnDestroy(): void {
    this.stop();
    this.vision.disconnect();
  }

  async toggle(): Promise<void> {
    if (this.running()) {
      this.stop();
    } else {
      await this.start();
    }
  }

  private async start(): Promise<void> {
    this.errorMsg.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const video = this.video().nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.running.set(true);

      const intervalMs = 1000 / environment.targetFps;
      this.captureTimer = window.setInterval(() => this.captureAndSend(), intervalMs);
    } catch (err) {
      this.errorMsg.set('Accès webcam refusé ou indisponible : ' + (err as Error).message);
    }
  }

  private stop(): void {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = undefined;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.running.set(false);
  }

  private captureAndSend(): void {
    const video = this.video().nativeElement;
    if (!video.videoWidth) {
      return;
    }
    const w = environment.sendWidth;
    const h = Math.round((video.videoHeight / video.videoWidth) * w);
    this.sendCanvas.width = w;
    this.sendCanvas.height = h;
    const ctx = this.sendCanvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    this.sendCanvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }
        blob.arrayBuffer().then((buf) =>
          this.vision.sendFrame(buf, { frameId: ++this.frameId, width: w, height: h }),
        );
      },
      'image/jpeg',
      environment.jpegQuality,
    );
  }

  private drawOverlay(dets: ReturnType<VisionService['detections']>): void {
    const canvas = this.overlay().nativeElement;
    const video = this.video().nativeElement;
    if (!video.videoWidth) {
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = Math.max(2, canvas.width / 320);
    ctx.font = `${Math.max(12, canvas.width / 45)}px system-ui, sans-serif`;
    for (const d of dets) {
      const x = d.box.x * canvas.width;
      const y = d.box.y * canvas.height;
      const w = d.box.w * canvas.width;
      const h = d.box.h * canvas.height;
      ctx.strokeStyle = '#2f7de1';
      ctx.strokeRect(x, y, w, h);
      const text = `${d.label} #${d.trackId}`;
      const tw = ctx.measureText(text).width + 8;
      ctx.fillStyle = '#2f7de1';
      ctx.fillRect(x, Math.max(0, y - 20), tw, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + 4, Math.max(14, y - 5));
    }
  }
}
