const { request } = require('@freelog-cli/utils');

module.exports = function() {
  return request({
    url: '/project/template',
  });
};
