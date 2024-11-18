const { request } = require('@freelog-cli/utils');

module.exports = function () {
    return new Promise((resolve) => {
        resolve([
            {
                "name": "freelog主题-vite-react模板",
                "npmName": "@freelog-cli/template-vite-react",
                "version": "1.0.0",
                "type": "normal",
                "installCommand": "npm install",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "theme"
                ],
                "buildPath": "dist"
            },
            {
                "name": "freelog主题-vite-react-ts模板",
                "npmName": "@freelog-cli/template-vite-react-ts",
                "version": "1.0.0",
                "type": "normal",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "theme"
                ],
                "buildPath": "dist"
            }, {
                "name": "freelog主题-vite-vue模板",
                "npmName": "@freelog-cli/template-vite-vue",
                "version": "1.0.0",
                "type": "normal",
                "installCommand": "npm install",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "theme"
                ],
                "buildPath": "dist"
            },
            {
                "name": "freelog主题-vite-vue-ts模板",
                "npmName": "@freelog-cli/template-vite-vue-ts",
                "version": "1.0.0",
                "type": "normal",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "theme"
                ],
                "buildPath": "dist"
            },
            {
                "name": "freelog主题-webapck-react模板",
                "npmName": "@freelog-cli/template-webapck-react",
                "version": "1.0.0",
                "type": "normal",
                "installCommand": "npm install",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "theme"
                ],
                "buildPath": "dist"
            },
            {
                "name": "freelog主题-webapck-react-ts模板",
                "npmName": "@freelog-cli/template-webapck-react-ts",
                "version": "1.0.0",
                "type": "normal",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "theme"
                ],
                "buildPath": "dist"
            }, {
                "name": "freelog主题-webapck-vue模板",
                "npmName": "@freelog-cli/template-webapck-vue",
                "version": "1.0.0",
                "type": "normal",
                "installCommand": "npm install",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "theme"
                ],
                "buildPath": "dist"
            },
            {
                "name": "freelog主题-webapck-vue-ts模板",
                "npmName": "@freelog-cli/template-webapck-vue-ts",
                "version": "1.0.0",
                "type": "normal",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "theme"
                ],
                "buildPath": "dist"
            }])
    })
};
