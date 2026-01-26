/**
 * Network Interceptor - Captures network requests via Chrome DevTools Protocol
 * Provides full network data: URL, method, status, headers, timing, body
 */
import { WebContents } from 'electron';

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  type: string;
  mimeType: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  responseSize: number;
  error?: string;
}

// Maximum number of requests to store in memory
const MAX_REQUESTS = 200;
// Maximum response body size to store (10KB instead of 100KB)
const MAX_RESPONSE_BODY_SIZE = 10 * 1024;

export class NetworkInterceptor {
  private requests: Map<string, NetworkRequest> = new Map();
  private webContents: WebContents | null = null;
  private onRequestCallback: ((requests: NetworkRequest[]) => void) | null = null;
  private debuggerAttached = false;

  /**
   * Attach to webContents and start intercepting
   */
  async attach(webContents: WebContents): Promise<void> {
    // Skip if already attached to this webContents
    if (this.debuggerAttached && this.webContents === webContents) {
      return;
    }

    // Detach from previous webContents if different
    if (this.debuggerAttached && this.webContents && this.webContents !== webContents) {
      this.detach();
    }

    this.webContents = webContents;

    try {
      // Check if debugger is already attached
      if (webContents.debugger.isAttached()) {
        this.debuggerAttached = true;
        return;
      }

      // Attach debugger
      webContents.debugger.attach('1.3');
      this.debuggerAttached = true;
      console.log('Network interceptor attached');

      // Enable network domain
      await webContents.debugger.sendCommand('Network.enable');

      // Setup event listeners
      webContents.debugger.on('message', (_, method, params) => {
        this.handleDebuggerMessage(method, params);
      });

      webContents.debugger.on('detach', (_, reason) => {
        console.log('Debugger detached:', reason);
        this.debuggerAttached = false;

        // If detached due to crash or render process issues, try to reattach after a delay
        if (reason === 'target_closed' || reason === 'canceled_by_user' || reason === 'render_widget_host_destroyed') {
          setTimeout(() => {
            if (this.webContents && !this.webContents.isDestroyed() && !this.webContents.isLoading()) {
              console.log('Attempting to reattach network interceptor...');
              this.attach(this.webContents).catch(err => {
                console.error('Failed to reattach:', err);
              });
            }
          }, 3000); // Increased delay for better stability
        }
      });
    } catch (err) {
      console.error('Failed to attach debugger:', err);
    }
  }

  /**
   * Handle CDP messages
   */
  private handleDebuggerMessage(method: string, params: Record<string, unknown>): void {
    // Skip if webContents is destroyed (app closing)
    if (!this.webContents || this.webContents.isDestroyed()) {
      return;
    }

    switch (method) {
      case 'Network.requestWillBeSent':
        this.onRequestWillBeSent(params);
        break;
      case 'Network.responseReceived':
        this.onResponseReceived(params);
        break;
      case 'Network.loadingFinished':
        this.onLoadingFinished(params);
        break;
      case 'Network.loadingFailed':
        this.onLoadingFailed(params);
        break;
    }
  }

  private onRequestWillBeSent(params: Record<string, unknown>): void {
    const requestId = params.requestId as string;
    const request = params.request as Record<string, unknown>;

    const networkRequest: NetworkRequest = {
      id: requestId,
      url: request.url as string,
      method: request.method as string,
      status: 0,
      statusText: '',
      type: (params.type as string) || 'Other',
      mimeType: '',
      startTime: Date.now(),
      requestHeaders: (request.headers as Record<string, string>) || {},
      responseHeaders: {},
      requestBody: request.postData as string | undefined,
      responseSize: 0
    };

    this.requests.set(requestId, networkRequest);

    // Prune old requests to prevent memory leak
    this.pruneOldRequests();

    this.notifyUpdate();
  }

  /**
   * Remove old requests when exceeding MAX_REQUESTS limit
   * Keeps only the most recent requests
   */
  private pruneOldRequests(): void {
    if (this.requests.size <= MAX_REQUESTS) {
      return;
    }

    // Get all requests sorted by start time (oldest first)
    const sortedRequests = Array.from(this.requests.entries())
      .sort((a, b) => a[1].startTime - b[1].startTime);

    // Remove oldest requests until we're under the limit
    const toRemove = sortedRequests.slice(0, this.requests.size - MAX_REQUESTS);
    for (const [id] of toRemove) {
      this.requests.delete(id);
    }
  }

  private onResponseReceived(params: Record<string, unknown>): void {
    const requestId = params.requestId as string;
    const response = params.response as Record<string, unknown>;
    const request = this.requests.get(requestId);

    if (request) {
      request.status = response.status as number;
      request.statusText = response.statusText as string;
      request.mimeType = response.mimeType as string;
      request.responseHeaders = (response.headers as Record<string, string>) || {};
      request.type = (params.type as string) || request.type;
      this.notifyUpdate();
    }
  }

  private async onLoadingFinished(params: Record<string, unknown>): Promise<void> {
    const requestId = params.requestId as string;
    const request = this.requests.get(requestId);

    if (request) {
      request.endTime = Date.now();
      request.duration = request.endTime - request.startTime;
      request.responseSize = (params.encodedDataLength as number) || 0;

      // Fetch response body for text-based responses
      // Skip if webContents is destroyed (app closing)
      if (this.webContents && !this.webContents.isDestroyed() && this.debuggerAttached) {
        try {
          const result = await this.webContents.debugger.sendCommand('Network.getResponseBody', {
            requestId
          }) as { body: string; base64Encoded: boolean };

          if (result.base64Encoded) {
            // For binary content, just indicate it's binary
            request.responseBody = `[Binary data: ${request.mimeType}]`;
          } else {
            // Limit response body size to prevent memory issues
            request.responseBody = result.body.substring(0, MAX_RESPONSE_BODY_SIZE);
          }
        } catch {
          // Some responses don't have body (304, redirects, etc.)
          request.responseBody = undefined;
        }
      }

      this.notifyUpdate();
    }
  }

  private onLoadingFailed(params: Record<string, unknown>): void {
    const requestId = params.requestId as string;
    const request = this.requests.get(requestId);

    if (request) {
      request.endTime = Date.now();
      request.duration = request.endTime - request.startTime;
      request.error = params.errorText as string;
      request.status = 0;
      this.notifyUpdate();
    }
  }

  /**
   * Set callback for request updates
   */
  onUpdate(callback: (requests: NetworkRequest[]) => void): void {
    this.onRequestCallback = callback;
  }

  private notifyUpdate(): void {
    // Skip if webContents is destroyed (app closing)
    if (!this.webContents || this.webContents.isDestroyed()) {
      return;
    }

    if (this.onRequestCallback) {
      // Return sorted by start time, newest first, limit to 100
      const requests = Array.from(this.requests.values())
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, 100);
      this.onRequestCallback(requests);
    }
  }

  /**
   * Get all requests
   */
  getRequests(): NetworkRequest[] {
    return Array.from(this.requests.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 100);
  }

  /**
   * Clear all requests
   */
  clear(): void {
    this.requests.clear();
    this.notifyUpdate();
  }

  /**
   * Detach debugger and cleanup
   */
  detach(): void {
    if (this.debuggerAttached && this.webContents && !this.webContents.isDestroyed()) {
      try {
        this.webContents.debugger.detach();
      } catch {
        // Ignore - may already be detached
      }
    }
    this.debuggerAttached = false;
    this.webContents = null;
    this.onRequestCallback = null;
  }
}
