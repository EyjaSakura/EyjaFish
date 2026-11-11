#!/bin/bash
echo "--- route ---"
ip route | head -3
echo "--- resolv ---"
head -3 /etc/resolv.conf
GW=$(ip route | awk '/default/ {print $3; exit}')
echo "GW=$GW"
if timeout 3 bash -c "</dev/tcp/127.0.0.1/6700" 2>/dev/null; then echo "wsl->127.0.0.1:6700 OK"; else echo "wsl->127.0.0.1:6700 FAIL"; fi
if timeout 3 bash -c "</dev/tcp/$GW/6700" 2>/dev/null; then echo "wsl->$GW:6700 OK"; else echo "wsl->$GW:6700 FAIL"; fi