# Medicare Project Shortcuts - Jaan Version
alias medstartjaan='cd "/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator - Jaan" && ./start-servers.sh'
alias medbackendjaan='cd "/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator - Jaan" && python3 api.py'
alias medfrontendjaan='cd "/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator - Jaan/React Frontend/physician-lookup-frontend" && npm run dev'# Medicare App Shortcuts
alias med='cd "/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator"'
alias medf='cd "/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator/React Frontend/physician-lookup-frontend"'
alias medback='med && python3 api.py'
alias medfront='medf && npm run dev'
alias medstart='bash "/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator/start-med.sh"'
alias medstop='lsof -ti:8000,5173 | xargs kill -9 2>/dev/null'
