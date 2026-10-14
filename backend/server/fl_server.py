"""Central FedAvg aggregation server (the Hub). Run this once, then start one
hospital_node.py process per participating hospital to join the round.

TLS is on by default (self-signed cert from generate_dev_cert.py, securing
the node<->server gRPC channel). Only model weights and scalar metrics ever
cross this boundary -- raw patient data never leaves a hospital node.
"""
import argparse
from pathlib import Path

import flwr as fl

from strategy import TelemetryFedProx

CERTS_DIR = Path(__file__).resolve().parents[1] / "certs"


def main(rounds: int, min_clients: int, proximal_mu: float, insecure: bool) -> None:
    strategy = TelemetryFedProx(
        min_available_clients=min_clients,
        min_fit_clients=min_clients,
        min_evaluate_clients=min_clients,
        proximal_mu=proximal_mu,
    )
    server_address = "0.0.0.0:8443"
    config = fl.server.ServerConfig(num_rounds=rounds)

    if insecure:
        fl.server.start_server(server_address=server_address, config=config, strategy=strategy)
    else:
        cert_bytes = (CERTS_DIR / "server.crt").read_bytes()
        key_bytes = (CERTS_DIR / "server.key").read_bytes()
        fl.server.start_server(
            server_address=server_address,
            config=config,
            strategy=strategy,
            certificates=(cert_bytes, cert_bytes, key_bytes),  # self-signed cert doubles as its own root
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--min_clients", type=int, default=3)
    parser.add_argument("--proximal_mu", type=float, default=0.1, help="FedProx proximal term weight")
    parser.add_argument("--insecure", action="store_true", help="plaintext gRPC, local debugging only")
    args = parser.parse_args()
    main(args.rounds, args.min_clients, args.proximal_mu, args.insecure)
