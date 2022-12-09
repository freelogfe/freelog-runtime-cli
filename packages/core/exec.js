function exec(command, args, options) {
    const win32 = process.platform === 'win32';

    const cmd = win32 ? 'cmd' : command;
    const cmdArgs = win32 ? ['/c'].concat(command, args) : args;

    return require('child_process').spawn(cmd, cmdArgs, options || {});
}
const ls = exec('Set-ExecutionPolicy -ExecutionPolicy Bypass')
ls.stdout.on('data', (data) => {
    console.log(`输出：${data}`);
});

ls.stderr.on('data', (data) => {
    console.log(`错误：${data}`);
});

ls.on('close', (code) => {
    console.log(`子进程退出码：${code}`);
});