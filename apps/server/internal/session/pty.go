package session

import (
	"errors"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/creack/pty"
)

type ExitInfo struct {
	Code   int `json:"code"`
	Signal int `json:"signal"`
}

type ProcessOptions struct {
	Command string
	Args    []string
	Cwd     string
	Env     map[string]string
	Cols    int
	Rows    int
}

type PtyProcess struct {
	cmd       *exec.Cmd
	pty       *os.File
	dataCh    chan string
	exitCh    chan ExitInfo
	done      chan struct{}
	readDone  chan struct{}
	closeOnce sync.Once
	closeErr  error
}

func NewPtyProcess(options ProcessOptions) (*PtyProcess, error) {
	if options.Command == "" {
		return nil, errors.New("missing command")
	}

	cmd := exec.Command(options.Command, options.Args...)
	cmd.Dir = options.Cwd
	cmd.Env = envMapToSlice(options.Env)

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Cols: uint16(options.Cols),
		Rows: uint16(options.Rows),
	})
	if err != nil {
		return nil, err
	}
	// Rewrap a nonblocking descriptor so os.NewFile registers it with the
	// runtime poller on macOS too. Fd calls during resize then preserve its mode.
	fd, err := syscall.Dup(int(ptmx.Fd()))
	if err == nil {
		syscall.CloseOnExec(fd)
		err = syscall.SetNonblock(fd, true)
		if err != nil {
			_ = syscall.Close(fd)
		}
	}
	if err != nil {
		_ = cmd.Process.Kill()
		_ = ptmx.Close()
		_ = cmd.Wait()
		return nil, err
	}
	pollablePTY := os.NewFile(uintptr(fd), ptmx.Name())
	_ = ptmx.Close()
	ptmx = pollablePTY

	proc := &PtyProcess{
		cmd:      cmd,
		pty:      ptmx,
		dataCh:   make(chan string, 256),
		exitCh:   make(chan ExitInfo, 1),
		done:     make(chan struct{}),
		readDone: make(chan struct{}),
	}

	go proc.readLoop()
	go proc.waitLoop()

	return proc, nil
}

func (p *PtyProcess) Data() <-chan string {
	return p.dataCh
}

func (p *PtyProcess) Exit() <-chan ExitInfo {
	return p.exitCh
}

func (p *PtyProcess) Write(data string) error {
	_, err := p.pty.Write([]byte(data))
	return err
}

func (p *PtyProcess) Resize(cols, rows int) error {
	return pty.Setsize(p.pty, &pty.Winsize{
		Cols: uint16(cols),
		Rows: uint16(rows),
	})
}

func (p *PtyProcess) Kill(sig syscall.Signal) error {
	if p.cmd.Process == nil {
		return nil
	}
	// StartWithSize creates a session/process group. Signal its children too.
	err := syscall.Kill(-p.cmd.Process.Pid, sig)
	if errors.Is(err, syscall.ESRCH) {
		return nil
	}
	return err
}

func (p *PtyProcess) Close() error {
	p.closeOnce.Do(func() {
		close(p.done)
		// Closing a terminal alone is insufficient for children that ignore
		// hangup/termination. A closed session must not leave its process group.
		_ = p.Kill(syscall.SIGKILL)
		p.closeErr = p.pty.Close()
	})
	return p.closeErr
}

func (p *PtyProcess) readLoop() {
	defer close(p.readDone)
	defer close(p.dataCh)
	buffer := make([]byte, 4096+utf8.UTFMax)
	pending := 0
	for {
		n, err := p.pty.Read(buffer[pending:])
		n += pending
		end := 0
		for end < n && (err != nil || utf8.FullRune(buffer[end:n])) {
			_, size := utf8.DecodeRune(buffer[end:n])
			end += size
		}
		if end > 0 {
			select {
			case p.dataCh <- string(buffer[:end]):
			case <-p.done:
				return
			}
		}
		if err != nil {
			return
		}
		pending = copy(buffer, buffer[end:n])
	}
}

func (p *PtyProcess) waitLoop() {
	err := p.cmd.Wait()
	state := p.cmd.ProcessState

	exitInfo := ExitInfo{
		Code:   0,
		Signal: 0,
	}
	if state != nil {
		exitInfo.Code = state.ExitCode()
		if status, ok := state.Sys().(syscall.WaitStatus); ok && status.Signaled() {
			exitInfo.Signal = int(status.Signal())
		}
	}
	if err != nil && exitInfo.Code == 0 {
		exitInfo.Code = 1
	}

	// Drain bytes already written before announcing exit. A background child
	// can retain the slave indefinitely, so bound this final drain.
	drainTimer := time.AfterFunc(time.Second, func() { _ = p.Close() })
	<-p.readDone
	drainTimer.Stop()
	_ = p.Close()
	p.exitCh <- exitInfo
	close(p.exitCh)
}

func envMapToSlice(env map[string]string) []string {
	result := make([]string, 0, len(env))
	for key, value := range env {
		result = append(result, key+"="+value)
	}
	return result
}
