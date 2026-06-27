package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// detectCmd prints the stations detected on this host as JSON. Debug/ops smoke
// test for the descriptors — no hub connection required.
func detectCmd() {
	stations := buildRegistry().DetectAll()
	b, err := json.MarshalIndent(stations, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(b))
}
