import type { QRChunkEnvelope } from '@/sync/qr'
import type { WebRTCOfferSession } from '@/sync/webrtc'

export type Tab = 'wifi' | 'qr' | 'history'

/** Render-only shape for WiFiTab; the real machine lives in sync/session/wifi. */
export type WiFiState =
  | { step: 'idle' }
  | { step: 'offering'; session: WebRTCOfferSession }
  | { step: 'scan-answer'; session: WebRTCOfferSession }
  | { step: 'scanning-offer' }
  | { step: 'answering'; encodedAnswer: string }
  | { step: 'syncing' }
  | { step: 'done'; applied: number; conflicts: number }
  | { step: 'error'; message: string }

/** Render-only shape for QRBatchTab, collapsing both role machines. */
export type QRBatchState =
  | { step: 'idle' }
  // Sender path: scan receiver clock → show delta chunks
  | { step: 'sender-scan-clock' }
  | { step: 'sender-show-data'; chunks: string[]; chunkIndex: number; recordCount: number }
  | { step: 'sender-up-to-date' }
  // Receiver path: show own clock → scan incoming chunks
  | { step: 'receiver-show-clock'; clockQR: string }
  | { step: 'receiver-scanning'; collected: Map<number, QRChunkEnvelope>; total: number | null }
  | { step: 'receiver-processing' } // all chunks collected, decrypting + applying
  | { step: 'done'; applied: number; conflicts: number }
  | { step: 'error'; message: string }
