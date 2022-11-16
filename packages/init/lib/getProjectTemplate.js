const { request } = require('@freelog-cli/utils');

module.exports = function() {
  return new Promise((resolve)=>{
     resolve([
      {
          "name": "freelog主题-vue2项目模板", 
          "npmName": "@freelog-cli/freelog-theme-vue2-template", 
          "version": "1.0.2", 
          "type": "normal", 
          "installCommand": "npm install", 
          "startCommand": "npm run serve", 
          "ignore": [
              "**/public/**"
          ], 
          "tag": [
              "project"
          ], 
          "buildPath": "dist"
      }, 
      {
          "name": "freelog主题-vue3项目模板", 
          "npmName": "@freelog-cli/freelog-theme-vue3-template", 
          "version": "1.0.2", 
          "type": "normal", 
          "startCommand": "npm run serve", 
          "ignore": [
              "**/public/**"
          ], 
          "tag": [
              "project"
          ], 
          "buildPath": "dist"
      }])
  })
};
