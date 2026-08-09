on run argv
	set phone to item 1 of argv
	set msg to item 2 of argv
	tell application "Messages"
		set targetService to id of 1st account whose service type = iMessage
		set theBuddy to participant phone of account id targetService
		send msg to theBuddy
	end tell
end run
