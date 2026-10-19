watchexec `
    --watch .\dist `
    --exts lua `
    --no-project-ignore `
    --debounce 1s `
    --on-busy-update queue `
    --shell=none `
    -- rclone copy .\dist gtnh-1:/World/opencomputers/8494bed7-51b3-48a6-8075-43bb921a60e4/home `
       --transfers 1 --retries 3 --verbose
       