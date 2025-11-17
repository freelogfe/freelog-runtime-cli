const { request } = require('@freelog-cli/utils');

module.exports = function () {
    return new Promise((resolve) => {
        resolve([
            {
                "name": "freelog主题-vite-react模板",
                "npmName": "@freelog-cli/template-v2-vite-react",
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
                "npmName": "@freelog-cli/template-v2-vite-react-ts",
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
                "npmName": "@freelog-cli/template-v2-vite-vue",
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
                "npmName": "@freelog-cli/template-v2-vite-vue-ts",
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
                "npmName": "@freelog-cli/template-v2-webapck-react",
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
                "npmName": "@freelog-cli/template-v2-webapck-react-ts",
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
                "npmName": "@freelog-cli/template-v2-webapck-vue",
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
                "npmName": "@freelog-cli/template-v2-webapck-vue-ts",
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
            },{
                "name": "freelog前端库-js-模板",
                "npmName": "@freelog-cli/template-v2-package-js",
                "version": "1.0.0",
                "type": "normal",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "package"
                ],
                "buildPath": "dist"
            },{
                "name": "freelog前端库-react-模板",
                "npmName": "@freelog-cli/template-v2-package-react",
                "version": "1.0.0",
                "type": "normal",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "package"
                ],
                "buildPath": "dist"
            },{
                "name": "freelog前端库-vue-模板",
                "npmName": "@freelog-cli/template-v2-package-vue",
                "version": "1.0.0",
                "type": "normal",
                "startCommand": "npm run start",
                "ignore": [
                    "**/public/**"
                ],
                "tag": [
                    "package"
                ],
                "buildPath": "dist"
            }])
    })
};
