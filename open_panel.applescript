-- 双击桌面快捷方式：确保本地服务在运行，然后打开双色球面板
on run
	set panelDir to "/Users/youhaoliu/Downloads/Codex/01 常规/Double-Color-Ball-AI"
	set statusCmd to "curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:8000/api/status"

	set statusCode to "000"
	try
		set statusCode to do shell script statusCmd
	end try

	if statusCode is not "200" then
		try
			do shell script "launchctl remove com.lauhaosky.dcb"
		end try
		-- 清理占用 8000 端口的残留进程（该端口专供本面板使用）
		try
			do shell script "pids=$(lsof -ti tcp:8000 || true); if [ -n \"$pids\" ]; then kill $pids; sleep 1; fi"
		end try
		try
			do shell script "launchctl submit -l com.lauhaosky.dcb -- " & quoted form of (panelDir & "/.venv/bin/python") & " " & quoted form of (panelDir & "/server.py")
		end try
		repeat 15 times
			delay 1
			set statusCode to "000"
			try
				set statusCode to do shell script statusCmd
			end try
			if statusCode is "200" then exit repeat
		end repeat
	end if

	if statusCode is "200" then
		do shell script "open " & quoted form of "http://localhost:8000"
	else
		display dialog "本地服务没能启动，请查看 /tmp/dcb_server.log。" buttons {"好"} default button 1 with icon caution
	end if
end run
