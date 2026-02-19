package session

import "syscall"

type Process interface {
	Data() <-chan string
	Exit() <-chan ExitInfo
	Write(data string) error
	Resize(cols, rows int) error
	Kill(sig syscall.Signal) error
	Close() error
}
