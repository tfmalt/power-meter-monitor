module.exports = function () {
    console.log(process.cwd());
    return {
        files: [
            "package.json",
            "config-test.js",
            "monitor.js",
            "updater.js",
            "lib/*.js"
        ],

        tests: [
            "test/*Test.js"
        ],

        env: {
            type: "node",
            runner: "/usr/local/bin/node",
            params: {
                env: "NODE_ENV=test; TZ=Europe/Oslo; NODE_PATH=$NODE_PATH:/Users/tm/PhpstormProjects/power-meter-monitor"
            }
        },

        workers: {
            recycle: false
        }
    }
};