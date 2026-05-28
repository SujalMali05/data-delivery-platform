import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface TransferProgressEvent {
  transferId: string;
  data: any;
}

/**
 * Service for broadcasting real-time transfer progress via SSE.
 * Uses RxJS Subject as an internal event bus.
 */
@Injectable()
export class TransferEventsService {
  private readonly progressSubject = new Subject<TransferProgressEvent>();

  /**
   * Broadcast progress update for a specific transfer
   */
  broadcastProgress(transferId: string, data: any): void {
    this.progressSubject.next({ transferId, data });
  }

  /**
   * Subscribe to progress events for a specific transfer (used by SSE endpoint)
   */
  getProgressStream(transferId: string): Observable<MessageEvent> {
    return this.progressSubject.pipe(
      filter((event) => event.transferId === transferId),
      map(
        (event) =>
          ({
            data: JSON.stringify(event.data),
          }) as MessageEvent,
      ),
    );
  }

  /**
   * Subscribe to ALL transfer progress events (used by dashboard overview)
   */
  getAllProgressStream(): Observable<MessageEvent> {
    return this.progressSubject.pipe(
      map(
        (event) =>
          ({
            data: JSON.stringify({
              transferId: event.transferId,
              ...event.data,
            }),
          }) as MessageEvent,
      ),
    );
  }
}
