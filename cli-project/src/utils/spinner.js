/**
 * 加载动画工具
 */

const ora = require('ora');

let currentSpinner = null;

/**
 * 创建加载动画
 * @param {string} text - 提示文本
 * @returns {Object} spinner 实例
 */
function createSpinner(text = 'Loading...') {
  if (currentSpinner) {
    currentSpinner.stop();
  }
  
  currentSpinner = ora({
    text,
    spinner: 'dots',
    color: 'cyan'
  });
  
  return currentSpinner;
}

/**
 * 开始加载动画
 * @param {string} text - 提示文本
 * @returns {Object} spinner 实例
 */
function startSpinner(text) {
  const spinner = createSpinner(text);
  spinner.start();
  return spinner;
}

/**
 * 成功停止
 * @param {string} text - 提示文本
 */
function succeedSpinner(text) {
  if (currentSpinner) {
    currentSpinner.succeed(text);
    currentSpinner = null;
  }
}

/**
 * 失败停止
 * @param {string} text - 提示文本
 */
function failSpinner(text) {
  if (currentSpinner) {
    currentSpinner.fail(text);
    currentSpinner = null;
  }
}

/**
 * 警告停止
 * @param {string} text - 提示文本
 */
function warnSpinner(text) {
  if (currentSpinner) {
    currentSpinner.warn(text);
    currentSpinner = null;
  }
}

/**
 * 信息停止
 * @param {string} text - 提示文本
 */
function infoSpinner(text) {
  if (currentSpinner) {
    currentSpinner.info(text);
    currentSpinner = null;
  }
}

/**
 * 停止动画
 */
function stopSpinner() {
  if (currentSpinner) {
    currentSpinner.stop();
    currentSpinner = null;
  }
}

module.exports = {
  createSpinner,
  startSpinner,
  succeedSpinner,
  failSpinner,
  warnSpinner,
  infoSpinner,
  stopSpinner
};

