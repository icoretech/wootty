package session

import (
	"strings"
	"sync"
	"syscall"
)

type FakeProcess struct {
	mu         sync.Mutex
	dataCh     chan string
	exitCh     chan ExitInfo
	lineBuffer strings.Builder
	exited     bool
}

func NewFakeProcess(options ProcessOptions) *FakeProcess {
	process := &FakeProcess{
		dataCh: make(chan string, 256),
		exitCh: make(chan ExitInfo, 1),
	}

	go process.emitData("WooTTY fake terminal ready (" + options.Command + " " + strings.Join(options.Args, " ") + ")\r\n$ ")

	return process
}

func (p *FakeProcess) Data() <-chan string {
	return p.dataCh
}

func (p *FakeProcess) Exit() <-chan ExitInfo {
	return p.exitCh
}

func (p *FakeProcess) Write(data string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.exited {
		return nil
	}

	for _, char := range data {
		if char == '\r' || char == '\n' {
			p.emitDataLocked("\r\n")
			trimmed := strings.TrimSpace(p.lineBuffer.String())
			p.lineBuffer.Reset()

			if trimmed == "exit" {
				p.emitExitLocked(ExitInfo{Code: 0, Signal: 0})
				return nil
			}

			p.emitDataLocked("$ ")
			continue
		}

		p.lineBuffer.WriteRune(char)
		p.emitDataLocked(string(char))
	}

	return nil
}

func (p *FakeProcess) Resize(_, _ int) error {
	return nil
}

func (p *FakeProcess) Kill(_ syscall.Signal) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.exited {
		return nil
	}
	p.emitExitLocked(ExitInfo{Code: 0, Signal: 15})
	return nil
}

func (p *FakeProcess) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.exited {
		return nil
	}
	p.emitExitLocked(ExitInfo{Code: 0, Signal: 15})
	return nil
}

func (p *FakeProcess) emitData(data string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.emitDataLocked(data)
}

func (p *FakeProcess) emitDataLocked(data string) {
	if p.exited {
		return
	}
	p.dataCh <- data
}

func (p *FakeProcess) emitExitLocked(exit ExitInfo) {
	if p.exited {
		return
	}
	p.exited = true
	p.exitCh <- exit
	close(p.exitCh)
	close(p.dataCh)
}
