watchexec `
    --watch .\dist `
    --exts lua `
    --no-project-ignore `
    --debounce 1s `
    --on-busy-update queue `
    --shell=none `
    -- rclone copy .\dist gtnh-1:/World/opencomputers/a0557fa9-10d8-4afb-ae4e-899110fd843b/home `
       --transfers 1 --retries 3 --verbose
       