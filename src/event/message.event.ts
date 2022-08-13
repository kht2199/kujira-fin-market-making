export class MessageEvent {

  public static readonly NAME = 'message';

  private readonly _message: string;

  constructor(message: string) {
    this._message = message;
  }

  get message(): string {
    return this._message;
  }
}