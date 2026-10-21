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
			set uidText to do shell script "id -u"
			do shell script "launchctl kickstart -k gui/" & uidText & "/com.lauhaosky.dcb"
		end try
		repeat 25 times
			delay 2
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
		display dialog "服务还在启动中，刚开机时可能需要多等一会儿。请稍后重新双击快捷方式。" buttons {"好"} default button 1 with icon note
	end if
end run
