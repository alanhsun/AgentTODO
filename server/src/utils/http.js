/**
 * HTTP 工具：统一的异步路由包装与错误类型
 */

class HttpError extends Error {
  /**
   * @param {number} status - HTTP 状态码
   * @param {string|string[]} message - 错误信息；传数组时以 { errors: [...] } 形式返回
   */
  constructor(status, message) {
    super(Array.isArray(message) ? message.join('; ') : message);
    this.status = status;
    if (Array.isArray(message)) this.errors = message;
  }
}

/** 包装 async 路由，把异常交给 Express 统一错误处理中间件 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** 解析正整数路径参数，非法时抛 400 */
function parseId(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError(400, `${name} must be a positive integer`);
  }
  return n;
}

module.exports = { HttpError, asyncHandler, parseId };
