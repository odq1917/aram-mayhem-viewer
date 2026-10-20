' MAYHEM.GG background launcher
' - Starts server.js without a console window (output goes to run_log.txt)
' - Does nothing if the server is already running
' - With "--open": waits for the server, then opens the dashboard in the browser
Option Explicit

Const DASHBOARD_URL = "http://localhost:3500"
Const STATUS_URL = "http://127.0.0.1:3500/api/ping"

Dim WshShell, fso, scriptDir, nodeBin, openBrowser, i
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

openBrowser = False
For i = 0 To WScript.Arguments.Count - 1
  If LCase(WScript.Arguments(i)) = "--open" Then openBrowser = True
Next

Function ServerIsUp()
  Dim http
  ServerIsUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 500, 500, 1000, 1000
  http.Open "GET", STATUS_URL, False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then ServerIsUp = True
  End If
  On Error GoTo 0
End Function

If Not ServerIsUp() Then
  nodeBin = "node"
  If fso.FileExists(scriptDir & "\runtime\node.exe") Then nodeBin = """" & scriptDir & "\runtime\node.exe"""
  WshShell.CurrentDirectory = scriptDir
  WshShell.Run "cmd.exe /c """ & nodeBin & " server.js > run_log.txt 2>&1""", 0, False
End If

If openBrowser Then
  For i = 1 To 60
    If ServerIsUp() Then Exit For
    WScript.Sleep 250
  Next
  WshShell.Run DASHBOARD_URL
End If
