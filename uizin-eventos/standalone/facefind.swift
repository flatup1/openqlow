import Foundation
import Vision
import AppKit

// 各画像で一番大きい顔の位置を返す。出力は左上原点の正規化座標。
for path in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        print("\(path)\tERR"); continue
    }
    let req = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([req]) } catch { print("\(path)\tERR"); continue }
    let faces = req.results ?? []
    if let f = faces.max(by: { $0.boundingBox.width * $0.boundingBox.height
                             < $1.boundingBox.width * $1.boundingBox.height }) {
        let b = f.boundingBox
        let top = 1.0 - (b.origin.y + b.size.height)
        print(String(format: "%@\t%.5f\t%.5f\t%.5f\t%.5f\t%d",
                     path, b.origin.x, top, b.size.width, b.size.height, faces.count))
    } else {
        print("\(path)\tNONE")
    }
}
