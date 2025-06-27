import { computed, ElementRef, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ChatService } from './chat.service';
import { ToastrService } from './toastr.service';
import { getErrorMessage, IXpert } from '../types';

@Injectable()
export class AudioRecorderService {
  readonly chatService = inject(ChatService)
  readonly #toastr = inject(ToastrService)

  // State
  readonly xpert = signal<IXpert>(null)
  readonly canvasRef = signal<ElementRef>(null)
  readonly text = signal<string>('')
    
  mediaRecorder!: MediaRecorder;
  audioChunks: Blob[] = []
  readonly speeching = computed(() => this.isRecording() || this.isConverting())
  readonly isRecording = signal(false)
  readonly isConverting = signal(false)
  readonly recordTimes = signal(0)
  stream!: MediaStream;
  recordingTimer: any;
  visualizerAnimationFrame: any;
  recordingStartTime = 0;
  private speechConverting: Subscription | null = null

  async startRecording() {
    this.text.set('')
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.setupVisualizer(this.stream);

      const options = { mimeType: this.getSupportedMimeType() };
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        clearInterval(this.recordingTimer);
        cancelAnimationFrame(this.visualizerAnimationFrame);
        this.canvasRef().nativeElement.height = this.canvasRef().nativeElement.height; // 清空画布

        const duration = Date.now() - this.recordingStartTime;
        if (duration < 1000) {
          alert('Recording too short');
          this.stopTracks();
          this.isRecording.set(false)
          return;
        }

        const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
        const file = new File([blob], `recording-${Date.now()}.mp3`, {
          type: 'audio/mp3'
        });

        this.isConverting.set(true)
        this.isRecording.set(false)
        this.speechConverting = this.chatService.speechToText(file, {xpertId: this.xpert().id, isDraft: true}).subscribe({
          next: ({text}) => {
            this.isConverting.set(false)
            this.text.set(text)
          },
          error: (error) => {
            this.isConverting.set(false)
            this.#toastr.error(getErrorMessage(error));
          }
        })
        this.stopTracks();
      };

      this.mediaRecorder.start(2000); // Generate a segment every 2 seconds
      this.isRecording.set(true)
      this.recordingStartTime = Date.now();
      this.startTimer();
    } catch (err) {
      alert('Microphone error. Please check permissions.');
      console.error(err);
    }
  }

  stopRecording() {
    if (this.isConverting()) {
      this.speechConverting?.unsubscribe()
    } else if (this.isRecording()) {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    }
  }

  private startTimer() {
    this.recordTimes.set(0)
    this.recordingTimer = setInterval(() => {
      this.recordTimes.update(seconds => seconds + 1)
    }, 1000)
  }

  private stopTracks() {
    this.stream?.getTracks().forEach(track => track.stop());
  }

  private getSupportedMimeType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  private setupVisualizer(stream: MediaStream) {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d')!;
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    source.connect(analyser);

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.visualizerAnimationFrame = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'lime';

      ctx.beginPath();
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  }
}
