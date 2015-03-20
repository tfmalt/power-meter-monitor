module.exports = function () {
    console.log(process.cwd());
    return {
        files: [
            "config-test.js",
            "package.json",
            "lib/*.js"
        ],

        tests: [
            "test/*Test.js"
        ],

        env: {
            type: "node",
            runner: "/usr/local/bin/node",
            params: {
                env: "POWER_ENV=test; TZ=Europe/Oslo; NODE_PATH=$NODE_PATH:/Users/tm/PhpstormProjects/power-meter-monitor"
            }
        }
    }
};