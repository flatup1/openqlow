/** アプリ共通のエラー型。code は機械可読、message はユーザー向け(中学生でも分かる日本語)。 */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(code: string, message: string, httpStatus = 400, retryable = false) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

export const Errors = {
  noImage: () => new AppError('NO_IMAGE', '画像が選ばれていません。PNG・JPG・WEBPの画像を選んでください。', 400),
  badMime: () => new AppError('BAD_MIME', 'この形式の画像は使えません。PNG・JPG・WEBPを選んでください。', 400),
  tooLarge: () => new AppError('FILE_TOO_LARGE', '画像のサイズが大きすぎます。10MB以下の画像を選んでください。', 413),
  invalidInput: (msg: string) => new AppError('INVALID_INPUT', msg, 400),
  noApiKey: () =>
    new AppError('NO_API_KEY', 'APIキーが設定されていません。管理者がサーバーの環境変数を確認してください。', 503),
  jobNotFound: () => new AppError('JOB_NOT_FOUND', '指定された動画ジョブが見つかりませんでした。', 404),
  notReady: () => new AppError('NOT_READY', 'まだ動画の生成が終わっていません。', 409),
  providerFailed: (retryable = true) =>
    new AppError(
      'PROVIDER_FAILED',
      'AI動画生成サービスが混雑しています。時間をおいて、もう一度お試しください。',
      502,
      retryable,
    ),
  timeout: () =>
    new AppError('TIMEOUT', '動画の生成に時間がかかっています。もう一度お試しください。', 504, true),
  internal: () => new AppError('INTERNAL', 'サーバーで問題が発生しました。時間をおいてお試しください。', 500, true),
};
