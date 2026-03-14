// ==UserScript==
// @name         Enso Web Inspector
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  选中页面元素并发送到 Enso，具备现代化的 UI 界面
// @author       Enso
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @updateURL    https://raw.githubusercontent.com/J3n5en/EnsoAI/main/scripts/web-inspector.user.js
// @downloadURL  https://raw.githubusercontent.com/J3n5en/EnsoAI/main/scripts/web-inspector.user.js
// ==/UserScript==

(() => {
  const CONFIG = {
    PORT: 18765,
    MAX_WALK_UP_DEPTH: 15, // Limit depth to avoid performance issues on deeply nested DOM
    THEME: {
      PRIMARY: '#4F46E5', // Enso Indigo
      DANGER: '#EF4444',
      SUCCESS: '#10B981',
      BG: '#ffffff',
      TEXT: '#1F2937',
      OVERLAY: 'rgba(79, 70, 229, 0.15)',
      BORDER: 'rgba(79, 70, 229, 0.5)',
    },
    ICONS: {
      TARGET: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 512 512" style="pointer-events:none;"><path d="M 266 415 L 266 416 L 267 417 L 270 417 L 271 416 L 271 414 L 268 414 L 267 415 Z M 275 407 L 278 407 L 278 406 L 276 406 Z M 275 402 L 274 402 L 274 403 Z M 247 400 L 246 401 L 247 401 Z M 286 390 L 285 390 L 285 391 Z M 268 388 L 270 388 L 273 386 L 269 386 L 268 387 Z M 305 385 L 304 386 L 303 386 L 301 388 L 302 387 L 303 387 L 304 386 L 305 386 Z M 280 384 L 283 384 L 285 382 L 282 382 L 281 383 L 280 383 Z M 294 359 L 293 360 L 291 360 L 289 362 L 288 362 L 289 362 L 290 361 L 291 361 Z M 295 355 L 294 354 L 293 355 Z M 222 351 L 223 352 L 223 351 Z M 131 348 L 131 349 L 132 350 L 132 351 L 133 351 L 131 349 Z M 295 344 L 294 343 L 293 343 L 291 345 L 292 346 L 294 346 L 295 345 Z M 199 334 L 199 337 L 200 338 L 201 338 L 203 336 L 203 335 L 202 334 Z M 173 328 L 175 330 L 176 330 L 177 331 L 177 330 L 176 329 L 175 329 L 174 328 Z M 96 297 L 96 299 L 98 299 L 98 297 Z M 354 250 L 354 252 L 355 253 L 354 254 L 354 255 L 355 256 L 355 251 Z M 161 226 L 160 227 L 160 229 L 160 228 L 161 227 Z M 163 206 L 162 207 L 162 209 L 162 208 L 163 207 Z M 399 199 L 399 200 L 401 203 L 401 205 L 402 206 L 402 208 L 404 211 L 404 210 L 403 209 L 403 207 L 401 204 L 401 202 Z M 140 175 L 139 175 L 139 176 Z M 154 154 L 151 157 L 152 156 L 153 156 L 154 155 Z M 167 149 L 166 149 L 164 151 Z M 156 138 L 155 139 L 154 139 L 152 141 L 152 144 L 155 144 L 157 142 L 157 139 Z M 180 137 L 179 137 L 175 141 L 174 141 L 168 147 L 170 145 L 171 145 L 178 138 L 179 138 Z M 213 135 L 214 135 L 215 134 L 216 134 L 214 134 Z M 174 134 L 173 135 L 172 135 L 164 143 L 163 143 L 157 149 L 157 150 L 156 151 L 156 152 L 157 151 L 158 151 L 160 149 L 160 148 L 162 146 L 163 146 L 163 145 L 164 144 L 164 143 L 166 141 L 167 141 L 172 136 L 173 136 L 173 135 Z M 219 132 L 218 133 L 219 133 Z M 179 130 L 176 132 L 177 132 Z M 334 126 L 334 127 L 335 127 L 336 128 Z M 187 125 L 186 125 L 183 127 L 184 127 L 186 125 Z M 327 122 L 329 124 L 330 124 Z M 200 118 L 198 118 L 197 119 L 196 119 L 194 121 L 193 121 L 194 121 L 197 119 L 199 119 Z M 245 114 L 245 115 L 244 116 L 242 116 L 241 115 L 242 116 L 241 117 L 237 117 L 236 118 L 233 118 L 232 119 L 230 119 L 229 120 L 231 120 L 232 121 L 231 122 L 230 122 L 228 124 L 225 124 L 224 125 L 223 125 L 220 128 L 219 128 L 218 129 L 216 129 L 215 128 L 215 129 L 212 131 L 211 130 L 210 131 L 209 131 L 208 130 L 206 132 L 204 132 L 203 133 L 202 133 L 199 135 L 197 135 L 195 137 L 194 137 L 193 136 L 191 138 L 190 138 L 189 139 L 188 139 L 187 140 L 186 140 L 183 143 L 182 143 L 176 149 L 175 149 L 167 157 L 167 158 L 163 162 L 163 163 L 164 164 L 160 168 L 160 169 L 157 172 L 157 173 L 155 175 L 155 176 L 153 178 L 153 179 L 151 181 L 151 182 L 149 184 L 149 185 L 146 187 L 147 188 L 147 189 L 144 192 L 144 193 L 143 194 L 144 195 L 143 196 L 142 196 L 142 197 L 141 198 L 140 197 L 140 195 L 141 194 L 141 192 L 142 191 L 142 188 L 143 187 L 143 186 L 145 183 L 145 182 L 143 185 L 142 184 L 142 185 L 143 186 L 141 188 L 140 188 L 140 189 L 139 190 L 139 192 L 138 193 L 138 194 L 137 195 L 137 196 L 135 199 L 135 201 L 133 204 L 133 207 L 131 210 L 131 213 L 130 214 L 129 213 L 129 209 L 130 208 L 130 206 L 131 205 L 131 203 L 132 202 L 132 199 L 134 196 L 134 193 L 135 192 L 135 191 L 137 188 L 136 188 L 136 189 L 135 190 L 135 191 L 134 192 L 134 193 L 132 196 L 132 198 L 130 201 L 130 203 L 129 204 L 129 206 L 126 209 L 127 210 L 127 212 L 124 214 L 123 213 L 123 212 L 124 211 L 124 208 L 125 207 L 125 206 L 126 205 L 127 205 L 127 204 L 126 203 L 126 202 L 127 201 L 127 199 L 128 198 L 128 196 L 129 195 L 130 195 L 129 194 L 129 190 L 131 187 L 131 186 L 130 186 L 130 187 L 127 190 L 126 189 L 126 186 L 127 185 L 127 184 L 128 183 L 128 182 L 130 179 L 130 177 L 131 176 L 131 175 L 133 172 L 131 174 L 131 175 L 129 177 L 129 178 L 128 179 L 128 180 L 126 182 L 126 183 L 125 184 L 125 186 L 124 187 L 124 188 L 123 189 L 123 190 L 122 191 L 121 190 L 121 188 L 122 187 L 122 185 L 124 182 L 124 180 L 125 179 L 125 178 L 126 177 L 126 176 L 127 175 L 127 174 L 128 173 L 128 172 L 129 171 L 128 172 L 128 173 L 127 174 L 127 175 L 126 176 L 126 177 L 125 178 L 125 179 L 124 180 L 124 181 L 123 182 L 123 183 L 122 184 L 122 185 L 120 188 L 120 190 L 118 192 L 118 194 L 117 195 L 117 197 L 116 198 L 116 200 L 115 201 L 115 203 L 114 204 L 114 206 L 113 207 L 113 210 L 112 211 L 112 214 L 111 215 L 111 217 L 110 218 L 110 222 L 109 223 L 109 226 L 108 227 L 108 233 L 107 234 L 107 241 L 106 242 L 105 241 L 105 239 L 104 240 L 104 243 L 105 244 L 104 245 L 104 248 L 105 249 L 105 262 L 106 263 L 106 268 L 107 269 L 107 274 L 108 275 L 108 280 L 109 281 L 109 285 L 110 286 L 110 288 L 111 289 L 111 293 L 112 294 L 112 296 L 111 297 L 110 296 L 110 295 L 109 294 L 109 292 L 108 291 L 108 290 L 106 287 L 106 285 L 105 284 L 105 281 L 104 280 L 104 277 L 103 276 L 103 271 L 102 270 L 102 263 L 101 262 L 102 261 L 102 260 L 101 259 L 101 254 L 101 267 L 102 268 L 102 273 L 103 274 L 103 279 L 104 280 L 104 283 L 105 284 L 105 288 L 106 289 L 106 291 L 107 292 L 107 295 L 108 296 L 108 298 L 109 299 L 109 301 L 110 302 L 110 304 L 112 307 L 112 309 L 114 312 L 114 314 L 115 315 L 115 316 L 116 317 L 116 318 L 117 319 L 117 320 L 119 322 L 119 323 L 120 324 L 120 325 L 122 327 L 122 328 L 123 329 L 123 330 L 125 332 L 125 333 L 127 335 L 127 336 L 128 337 L 128 338 L 131 341 L 131 342 L 135 346 L 135 347 L 139 351 L 139 352 L 146 359 L 146 360 L 147 360 L 152 365 L 153 365 L 157 369 L 158 369 L 159 370 L 160 370 L 161 371 L 161 372 L 162 372 L 164 374 L 165 374 L 168 377 L 169 377 L 172 380 L 173 380 L 175 382 L 176 382 L 178 384 L 179 384 L 181 386 L 182 386 L 185 389 L 186 389 L 188 391 L 189 391 L 190 392 L 191 392 L 192 393 L 193 393 L 196 395 L 198 395 L 199 396 L 200 396 L 203 398 L 206 398 L 207 399 L 209 399 L 210 400 L 219 400 L 220 399 L 222 399 L 223 398 L 225 398 L 226 397 L 233 397 L 234 398 L 235 397 L 239 397 L 242 395 L 244 395 L 245 394 L 245 393 L 246 392 L 246 391 L 249 388 L 249 387 L 252 385 L 252 384 L 254 381 L 254 379 L 255 378 L 255 374 L 254 373 L 255 372 L 255 369 L 253 367 L 251 367 L 249 365 L 249 364 L 248 363 L 248 362 L 243 357 L 242 357 L 239 355 L 237 355 L 236 354 L 234 356 L 233 356 L 231 354 L 230 355 L 229 355 L 228 354 L 228 353 L 225 353 L 224 354 L 223 354 L 222 355 L 221 355 L 220 354 L 218 354 L 216 352 L 215 352 L 214 351 L 212 351 L 213 351 L 215 353 L 214 354 L 213 354 L 210 352 L 208 352 L 205 349 L 204 349 L 203 350 L 202 349 L 198 349 L 197 348 L 196 348 L 194 346 L 193 346 L 192 345 L 191 345 L 188 343 L 188 344 L 187 345 L 185 343 L 184 343 L 182 341 L 181 341 L 179 339 L 179 338 L 178 338 L 173 333 L 174 332 L 172 330 L 171 330 L 165 324 L 165 323 L 166 322 L 168 324 L 168 323 L 169 322 L 170 322 L 168 319 L 168 318 L 169 317 L 175 323 L 175 324 L 178 327 L 179 327 L 180 326 L 181 327 L 182 327 L 185 330 L 186 330 L 188 332 L 189 332 L 192 334 L 194 334 L 193 333 L 192 333 L 189 330 L 188 330 L 186 328 L 185 328 L 176 319 L 177 318 L 178 318 L 181 321 L 182 321 L 184 323 L 185 323 L 187 325 L 188 325 L 189 326 L 191 326 L 190 326 L 188 324 L 187 324 L 185 322 L 184 322 L 182 320 L 181 320 L 179 317 L 180 316 L 179 315 L 179 314 L 175 310 L 175 309 L 170 304 L 169 305 L 166 302 L 166 301 L 167 300 L 168 301 L 167 300 L 167 299 L 166 298 L 166 297 L 165 297 L 164 298 L 162 296 L 162 295 L 161 294 L 161 293 L 159 290 L 159 288 L 158 287 L 158 283 L 156 280 L 156 278 L 154 276 L 154 274 L 153 273 L 153 270 L 154 269 L 154 267 L 154 268 L 153 269 L 152 268 L 152 266 L 153 265 L 153 259 L 154 258 L 155 259 L 155 263 L 156 264 L 156 267 L 157 268 L 157 271 L 159 274 L 159 273 L 158 272 L 158 268 L 157 267 L 157 262 L 156 261 L 156 259 L 155 258 L 155 248 L 154 247 L 155 246 L 154 245 L 154 236 L 155 235 L 154 234 L 154 230 L 154 231 L 153 232 L 153 233 L 152 234 L 151 233 L 151 228 L 152 227 L 152 222 L 153 221 L 153 218 L 154 217 L 154 214 L 155 213 L 155 212 L 157 210 L 158 210 L 159 209 L 159 208 L 160 207 L 160 206 L 162 203 L 162 201 L 163 200 L 163 199 L 164 198 L 164 197 L 165 196 L 166 196 L 167 197 L 167 199 L 165 201 L 165 202 L 164 203 L 164 204 L 165 205 L 165 208 L 164 209 L 164 211 L 163 212 L 163 217 L 162 218 L 162 221 L 161 222 L 161 223 L 162 223 L 162 221 L 163 220 L 163 217 L 165 214 L 165 211 L 166 210 L 166 209 L 168 206 L 168 203 L 170 201 L 170 200 L 171 199 L 171 198 L 173 196 L 173 195 L 174 194 L 174 193 L 176 190 L 176 188 L 175 187 L 176 186 L 176 185 L 183 178 L 183 177 L 188 172 L 188 171 L 191 168 L 193 168 L 194 167 L 195 167 L 195 166 L 196 165 L 197 165 L 200 162 L 201 162 L 202 161 L 203 161 L 207 157 L 208 157 L 209 156 L 210 156 L 211 155 L 212 155 L 215 153 L 217 153 L 220 151 L 223 151 L 224 150 L 225 150 L 226 149 L 228 149 L 229 148 L 233 148 L 234 147 L 236 147 L 239 145 L 241 145 L 242 144 L 247 144 L 248 143 L 259 143 L 260 142 L 263 142 L 264 143 L 275 143 L 276 144 L 279 144 L 280 145 L 282 145 L 283 146 L 288 146 L 289 147 L 291 147 L 292 148 L 295 148 L 296 149 L 297 149 L 298 150 L 299 150 L 300 151 L 301 151 L 303 153 L 304 153 L 305 154 L 306 154 L 307 155 L 308 155 L 309 156 L 310 156 L 312 158 L 313 158 L 314 159 L 315 159 L 317 161 L 318 161 L 332 175 L 332 176 L 331 177 L 330 177 L 329 176 L 331 178 L 331 179 L 335 183 L 335 184 L 337 186 L 337 187 L 340 190 L 340 191 L 341 192 L 341 193 L 343 195 L 343 196 L 345 198 L 345 199 L 346 200 L 346 201 L 347 202 L 347 203 L 349 206 L 349 208 L 350 209 L 350 210 L 352 213 L 352 215 L 353 216 L 353 218 L 354 219 L 354 221 L 355 222 L 355 226 L 354 227 L 353 227 L 351 225 L 351 224 L 350 223 L 350 221 L 348 218 L 348 216 L 347 215 L 347 213 L 345 211 L 345 208 L 343 206 L 343 205 L 342 204 L 344 207 L 344 209 L 345 210 L 345 212 L 346 213 L 346 214 L 348 217 L 348 221 L 349 222 L 349 224 L 350 225 L 350 227 L 351 228 L 351 230 L 352 231 L 352 236 L 353 237 L 353 241 L 354 242 L 354 238 L 355 237 L 356 238 L 356 239 L 357 238 L 358 239 L 358 241 L 359 242 L 359 244 L 358 245 L 357 244 L 357 246 L 358 245 L 359 246 L 359 248 L 358 249 L 358 258 L 358 249 L 359 248 L 360 249 L 360 263 L 359 264 L 359 269 L 358 270 L 358 274 L 357 275 L 357 278 L 356 279 L 356 281 L 355 282 L 355 284 L 354 285 L 354 288 L 353 289 L 353 290 L 352 291 L 352 293 L 351 294 L 351 295 L 349 298 L 349 300 L 347 302 L 347 303 L 346 304 L 346 305 L 345 306 L 345 307 L 344 308 L 344 309 L 342 311 L 342 312 L 340 314 L 340 315 L 337 318 L 336 317 L 336 316 L 338 314 L 338 313 L 339 312 L 339 311 L 340 310 L 340 309 L 342 307 L 342 306 L 343 305 L 343 304 L 344 303 L 344 302 L 346 299 L 346 297 L 347 296 L 347 294 L 348 293 L 348 291 L 349 290 L 349 288 L 350 287 L 350 285 L 350 287 L 349 288 L 349 290 L 348 291 L 348 293 L 347 294 L 347 296 L 345 299 L 345 301 L 344 302 L 344 303 L 342 305 L 342 306 L 341 307 L 341 308 L 339 310 L 339 311 L 338 312 L 338 313 L 337 314 L 337 315 L 335 317 L 335 318 L 331 322 L 331 323 L 332 324 L 331 325 L 331 326 L 323 334 L 323 335 L 318 340 L 317 340 L 315 343 L 314 343 L 311 346 L 313 344 L 314 344 L 315 345 L 306 354 L 305 354 L 304 353 L 303 353 L 301 355 L 300 355 L 299 356 L 298 356 L 299 356 L 300 357 L 297 360 L 296 360 L 295 361 L 296 360 L 297 360 L 298 359 L 299 359 L 300 358 L 301 358 L 304 355 L 305 355 L 307 353 L 308 353 L 311 351 L 313 353 L 311 355 L 310 355 L 307 358 L 306 358 L 303 361 L 302 361 L 300 363 L 298 363 L 297 364 L 296 364 L 295 365 L 294 365 L 294 366 L 295 365 L 296 365 L 297 364 L 298 364 L 299 363 L 300 363 L 302 361 L 303 361 L 304 360 L 305 360 L 306 359 L 307 359 L 308 358 L 309 358 L 310 357 L 311 357 L 314 355 L 315 355 L 316 356 L 313 359 L 312 359 L 309 362 L 308 362 L 307 363 L 306 363 L 304 365 L 303 365 L 301 367 L 300 367 L 299 368 L 298 368 L 295 370 L 296 369 L 297 369 L 300 367 L 302 367 L 303 368 L 301 370 L 300 370 L 299 371 L 298 371 L 298 372 L 300 370 L 302 370 L 303 369 L 307 369 L 308 368 L 309 368 L 310 367 L 311 367 L 315 363 L 316 363 L 317 362 L 318 362 L 320 360 L 321 361 L 321 363 L 320 364 L 319 364 L 315 368 L 314 367 L 314 368 L 309 373 L 308 373 L 307 374 L 306 374 L 305 375 L 304 375 L 302 377 L 301 377 L 299 379 L 297 379 L 297 380 L 296 381 L 295 381 L 294 382 L 293 382 L 294 382 L 297 380 L 299 380 L 300 381 L 299 382 L 298 382 L 295 384 L 293 384 L 290 386 L 291 386 L 292 385 L 294 385 L 295 384 L 297 384 L 300 382 L 302 382 L 303 381 L 304 381 L 307 379 L 308 379 L 309 380 L 307 382 L 306 382 L 305 383 L 304 383 L 305 383 L 306 382 L 308 382 L 310 380 L 309 380 L 308 379 L 309 378 L 310 378 L 313 376 L 314 376 L 315 377 L 313 379 L 312 379 L 313 379 L 314 378 L 315 378 L 316 377 L 317 377 L 320 375 L 321 375 L 322 376 L 321 377 L 322 376 L 321 375 L 323 373 L 324 373 L 325 374 L 326 374 L 325 374 L 324 373 L 326 371 L 327 371 L 328 372 L 329 372 L 331 370 L 332 370 L 335 367 L 336 367 L 338 365 L 339 365 L 342 362 L 343 362 L 344 363 L 342 365 L 342 367 L 339 370 L 338 370 L 333 375 L 332 375 L 333 375 L 334 374 L 335 374 L 336 375 L 334 377 L 333 377 L 331 379 L 330 379 L 328 381 L 327 381 L 325 383 L 324 383 L 322 385 L 321 385 L 320 386 L 319 386 L 317 388 L 316 388 L 315 389 L 314 389 L 312 391 L 311 391 L 308 393 L 306 393 L 305 394 L 304 394 L 303 395 L 302 395 L 303 395 L 304 394 L 306 394 L 307 393 L 309 393 L 310 392 L 312 392 L 313 391 L 314 391 L 315 390 L 316 390 L 317 389 L 318 389 L 319 388 L 320 388 L 321 387 L 322 387 L 325 385 L 326 385 L 327 386 L 325 388 L 324 388 L 322 390 L 321 390 L 320 391 L 319 391 L 318 392 L 317 392 L 316 393 L 315 393 L 314 394 L 313 394 L 312 395 L 311 395 L 310 396 L 309 396 L 306 398 L 304 398 L 301 400 L 299 400 L 298 401 L 296 401 L 295 402 L 294 402 L 293 403 L 293 404 L 294 404 L 295 403 L 297 403 L 298 402 L 300 402 L 301 401 L 303 401 L 305 399 L 307 399 L 308 398 L 311 398 L 312 397 L 313 397 L 314 396 L 315 396 L 316 395 L 317 395 L 318 394 L 319 394 L 320 393 L 321 393 L 322 392 L 323 392 L 325 390 L 327 390 L 329 388 L 330 388 L 332 386 L 333 386 L 335 384 L 336 384 L 338 382 L 339 382 L 345 376 L 346 376 L 350 372 L 351 372 L 354 369 L 354 368 L 355 367 L 356 367 L 358 365 L 359 366 L 359 367 L 356 370 L 357 369 L 358 369 L 362 365 L 362 364 L 369 357 L 369 356 L 375 350 L 375 349 L 378 346 L 378 345 L 380 343 L 380 342 L 382 340 L 382 339 L 384 337 L 384 336 L 386 334 L 386 333 L 388 331 L 388 330 L 390 327 L 390 325 L 392 323 L 392 321 L 393 320 L 393 319 L 395 316 L 395 314 L 397 311 L 397 308 L 398 307 L 398 304 L 399 303 L 399 301 L 400 300 L 400 297 L 401 296 L 401 293 L 402 292 L 402 291 L 401 290 L 401 289 L 402 288 L 402 287 L 401 286 L 401 284 L 402 283 L 403 284 L 403 282 L 404 281 L 404 272 L 405 271 L 405 265 L 406 264 L 406 244 L 405 243 L 405 238 L 404 237 L 404 229 L 403 228 L 403 224 L 402 223 L 402 218 L 401 217 L 401 215 L 400 214 L 400 212 L 399 211 L 399 209 L 398 208 L 398 205 L 396 202 L 396 200 L 395 199 L 395 197 L 394 196 L 394 194 L 392 191 L 392 189 L 391 188 L 391 187 L 390 186 L 390 185 L 389 184 L 389 183 L 388 182 L 388 181 L 387 180 L 387 179 L 386 178 L 386 177 L 385 176 L 385 175 L 384 174 L 384 173 L 382 171 L 382 170 L 380 168 L 380 167 L 379 166 L 379 165 L 377 163 L 377 162 L 376 161 L 376 160 L 374 158 L 374 157 L 372 155 L 372 154 L 370 152 L 370 151 L 368 149 L 367 149 L 365 147 L 364 147 L 361 144 L 361 143 L 360 142 L 360 141 L 357 141 L 352 136 L 351 136 L 350 135 L 353 138 L 352 139 L 351 139 L 350 138 L 349 138 L 344 133 L 343 133 L 341 131 L 340 131 L 338 129 L 338 130 L 339 130 L 341 132 L 342 132 L 343 133 L 343 134 L 346 137 L 346 138 L 345 139 L 342 136 L 341 136 L 339 134 L 338 134 L 337 133 L 336 133 L 335 132 L 334 132 L 333 131 L 332 131 L 330 129 L 329 129 L 328 128 L 327 129 L 325 127 L 324 127 L 323 126 L 322 126 L 321 125 L 320 125 L 319 124 L 318 124 L 317 123 L 316 123 L 317 124 L 318 124 L 319 125 L 320 125 L 322 127 L 323 127 L 324 128 L 325 128 L 326 129 L 327 129 L 329 131 L 330 131 L 333 134 L 334 134 L 336 136 L 337 136 L 345 144 L 344 145 L 345 146 L 343 148 L 342 148 L 341 147 L 340 147 L 336 143 L 335 143 L 332 140 L 331 140 L 330 139 L 329 139 L 327 137 L 326 137 L 325 136 L 324 136 L 322 134 L 321 134 L 319 132 L 318 132 L 317 131 L 316 131 L 315 130 L 314 130 L 313 129 L 312 129 L 311 128 L 310 128 L 307 126 L 305 126 L 302 124 L 300 124 L 299 123 L 297 123 L 296 122 L 294 122 L 293 121 L 289 121 L 288 120 L 285 120 L 284 119 L 280 119 L 279 118 L 275 118 L 274 117 L 270 117 L 269 116 L 259 116 L 256 114 Z" fill="#000000" fill-rule="evenodd"/></svg>`,
      CLOSE: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    },
  };

  class EnsoInspector {
    constructor() {
      this.isActive = false;
      this.isDragging = false;
      this.hoveredElement = null;
      this.elements = {
        btn: null,
        overlay: null,
        label: null,
        style: null,
      };
      this.menuCommandId = null;
      this.toggleMenuCommandId = null;
      this.resetMenuCommandId = null;
      this.shortcutMenuId = null;
      this.dragOffset = { x: 0, y: 0 };

      this.init();
    }

    init() {
      this.updateMenuCommand();

      // Wait for DOM to be ready before creating UI
      const initUI = () => {
        this.injectStyles();
        if (this.isEnabledForSite()) {
          this.createUI();
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
      } else {
        initUI();
      }
    }

    // --- Persistence ---
    isEnabledForSite() {
      const enabledSites = GM_getValue('enabledSites', {});
      return enabledSites[window.location.host] === true;
    }

    setEnabledForSite(enabled) {
      const enabledSites = GM_getValue('enabledSites', {});
      if (enabled) {
        enabledSites[window.location.host] = true;
      } else {
        delete enabledSites[window.location.host];
      }
      GM_setValue('enabledSites', enabledSites);
    }

    // --- UI Creation ---
    injectStyles() {
      if (this.elements.style) return;
      const style = document.createElement('style');
      style.textContent = `
        .enso-fab {
          position: fixed; bottom: 24px; right: 24px;
          width: 56px; height: 56px;
          background: ${CONFIG.THEME.BG};
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          color: ${CONFIG.THEME.PRIMARY};
          cursor: grab; z-index: 2147483647;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1);
          transition: box-shadow 0.3s, transform 0.3s;
          user-select: none; touch-action: none;
          will-change: left, top;
        }
        .enso-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.2); }
        .enso-fab:active { cursor: grabbing; transform: scale(0.95); }
        .enso-fab.active { background: ${CONFIG.THEME.PRIMARY}; color: white; transform: rotate(90deg); }
        
        .enso-overlay {
          position: fixed; pointer-events: none;
          border: 1.5px solid ${CONFIG.THEME.PRIMARY};
          background: ${CONFIG.THEME.OVERLAY};
          z-index: 2147483646; display: none;
          box-sizing: border-box; transition: all 0.1s ease-out;
          border-radius: 2px;
        }
        
        .enso-label {
          position: fixed; background: ${CONFIG.THEME.PRIMARY};
          color: white; padding: 4px 10px; font-size: 11px;
          font-family: 'SF Mono', SFMono-Regular, ui-monospace, 'DejaVu Sans Mono', monospace;
          border-radius: 6px; z-index: 2147483647; display: none;
          pointer-events: none; white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        .enso-toast {
          position: fixed; top: 24px; left: 50%;
          transform: translateX(-50%) translateY(-20px);
          background: rgba(31, 41, 55, 0.95);
          backdrop-filter: blur(8px);
          color: white; padding: 12px 20px; border-radius: 12px;
          font-size: 14px; font-weight: 500;
          z-index: 2147483647; opacity: 0;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex; align-items: center; gap: 8px;
        }
        .enso-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        .enso-shortcut-dialog {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
          z-index: 2147483647; display: flex;
          align-items: center; justify-content: center;
        }
        .enso-shortcut-box {
          background: white; border-radius: 16px; padding: 28px 32px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center; min-width: 340px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .enso-shortcut-box h3 {
          margin: 0 0 16px; font-size: 16px; color: #1F2937;
        }
        .enso-shortcut-box p {
          margin: 0 0 16px; font-size: 13px; color: #6B7280;
        }
        .enso-shortcut-tabs {
          display: flex; gap: 0; margin-bottom: 20px;
          border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden;
        }
        .enso-shortcut-tab {
          flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 500;
          border: none; cursor: pointer; transition: all 0.2s;
          background: #F9FAFB; color: #6B7280;
        }
        .enso-shortcut-tab + .enso-shortcut-tab { border-left: 1px solid #E5E7EB; }
        .enso-shortcut-tab.active {
          background: ${CONFIG.THEME.PRIMARY}; color: white;
        }
        .enso-shortcut-kbd {
          display: inline-block; padding: 12px 24px;
          background: #F3F4F6; border: 2px dashed #D1D5DB;
          border-radius: 12px; font-size: 18px; font-weight: 600;
          color: ${CONFIG.THEME.PRIMARY}; min-width: 120px;
          font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
          transition: all 0.2s;
        }
        .enso-shortcut-kbd.recording {
          border-color: ${CONFIG.THEME.PRIMARY};
          background: rgba(79, 70, 229, 0.05);
        }
        .enso-shortcut-actions {
          margin-top: 20px; display: flex; gap: 8px; justify-content: center;
        }
        .enso-shortcut-actions button {
          padding: 8px 20px; border-radius: 8px; border: none;
          font-size: 13px; font-weight: 500; cursor: pointer;
          transition: all 0.2s;
        }
        .enso-shortcut-actions .cancel {
          background: #F3F4F6; color: #374151;
        }
        .enso-shortcut-actions .confirm {
          background: ${CONFIG.THEME.PRIMARY}; color: white;
        }
        .enso-shortcut-actions .confirm:disabled {
          opacity: 0.4; cursor: not-allowed;
        }
      `;
      document.head.appendChild(style);
      this.elements.style = style;
    }

    createUI() {
      if (this.elements.btn) return;

      const btn = document.createElement('div');
      btn.className = 'enso-fab';
      btn.innerHTML = CONFIG.ICONS.TARGET;
      const shortcuts = this.getShortcuts();
      btn.title = `开启元素选择 (可拖动) | ${this.formatShortcut(shortcuts.toggle)} 切换 | ${this.formatShortcut(shortcuts.reset)} 复位`;

      // 恢复保存的位置
      const savedPos = GM_getValue('btnPosition', null);
      if (savedPos) {
        btn.style.left = `${savedPos.x}px`;
        btn.style.top = `${savedPos.y}px`;
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
      }

      document.body.appendChild(btn);
      this.elements.btn = btn;

      const overlay = document.createElement('div');
      overlay.className = 'enso-overlay';
      document.body.appendChild(overlay);
      this.elements.overlay = overlay;

      const label = document.createElement('div');
      label.className = 'enso-label';
      document.body.appendChild(label);
      this.elements.label = label;

      this.bindEvents();
    }

    destroyUI() {
      if (this.isActive) this.toggleMode();
      Object.values(this.elements).forEach((el) => {
        el?.remove();
      });
      this.elements = { btn: null, overlay: null, label: null, style: null };
    }

    // --- Events ---
    bindEvents() {
      const { btn } = this.elements;

      let startPos = { x: 0, y: 0 };
      let btnPos = { x: 0, y: 0 };
      let rafId = null;

      const onMouseDown = (e) => {
        if (e.button !== 0) return;
        this.isDragging = false;
        startPos = { x: e.clientX, y: e.clientY };
        const rect = btn.getBoundingClientRect();
        btnPos = { x: rect.left, y: rect.top };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        if (!this.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          this.isDragging = true;
        }
        if (this.isDragging) {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            const newX = btnPos.x + dx;
            const newY = btnPos.y + dy;
            btn.style.left = `${newX}px`;
            btn.style.top = `${newY}px`;
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
          });
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (rafId) cancelAnimationFrame(rafId);

        // 保存位置
        if (this.isDragging) {
          const rect = btn.getBoundingClientRect();
          GM_setValue('btnPosition', { x: rect.left, y: rect.top });
        }
      };

      btn.addEventListener('mousedown', onMouseDown);
      btn.addEventListener('click', (_e) => {
        if (!this.isDragging) this.toggleMode();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isActive) this.toggleMode();
        const shortcuts = this.getShortcuts();
        if (this.matchShortcut(e, shortcuts.toggle)) {
          e.preventDefault();
          e.stopPropagation();
          this.toggleMode();
        }
        if (this.matchShortcut(e, shortcuts.reset)) {
          e.preventDefault();
          e.stopPropagation();
          this.resetPosition();
        }
      });
    }

    resetPosition() {
      const { btn } = this.elements;
      if (!btn) return;
      GM_setValue('btnPosition', null);
      btn.style.left = '';
      btn.style.top = '';
      btn.style.right = '24px';
      btn.style.bottom = '24px';
      this.showToast('🔄 按钮已复位', 'info');
    }

    // --- Shortcut Management ---
    static DEFAULT_SHORTCUTS = {
      toggle: { altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, code: 'KeyE' },
      reset: { altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, code: 'KeyR' },
    };

    static SHORTCUT_LABELS = { toggle: '切换元素选择', reset: '复位按钮位置' };

    getShortcuts() {
      return GM_getValue('shortcuts', EnsoInspector.DEFAULT_SHORTCUTS);
    }

    saveShortcut(name, shortcut) {
      const shortcuts = this.getShortcuts();
      shortcuts[name] = shortcut;
      GM_setValue('shortcuts', shortcuts);
    }

    matchShortcut(e, shortcut) {
      return (
        e.altKey === shortcut.altKey &&
        e.shiftKey === shortcut.shiftKey &&
        e.ctrlKey === shortcut.ctrlKey &&
        e.metaKey === shortcut.metaKey &&
        e.code === shortcut.code
      );
    }

    formatShortcut(shortcut) {
      const parts = [];
      if (shortcut.ctrlKey) parts.push('⌃');
      if (shortcut.altKey) parts.push('⌥');
      if (shortcut.shiftKey) parts.push('⇧');
      if (shortcut.metaKey) parts.push('⌘');
      const keyMap = {
        Backquote: '`',
        Minus: '-',
        Equal: '=',
        BracketLeft: '[',
        BracketRight: ']',
        Backslash: '\\',
        Semicolon: ';',
        Quote: "'",
        Comma: ',',
        Period: '.',
        Slash: '/',
      };
      const code = shortcut.code;
      if (code.startsWith('Key')) parts.push(code.slice(3));
      else if (code.startsWith('Digit')) parts.push(code.slice(5));
      else parts.push(keyMap[code] || code.replace('Arrow', ''));
      return parts.join('');
    }

    showShortcutDialog() {
      const names = Object.keys(EnsoInspector.SHORTCUT_LABELS);
      const shortcuts = this.getShortcuts();
      // Per-tab pending state
      const pendings = {};

      const dialog = document.createElement('div');
      dialog.className = 'enso-shortcut-dialog';
      dialog.innerHTML = `
        <div class="enso-shortcut-box">
          <h3>快捷键设置</h3>
          <div class="enso-shortcut-tabs">
            ${names.map((n, i) => `<button class="enso-shortcut-tab${i === 0 ? ' active' : ''}" data-name="${n}">${EnsoInspector.SHORTCUT_LABELS[n]}</button>`).join('')}
          </div>
          <p>请按下新的快捷键组合（需包含修饰键）</p>
          <div class="enso-shortcut-kbd">${this.formatShortcut(shortcuts[names[0]])}</div>
          <div class="enso-shortcut-actions">
            <button class="cancel">取消</button>
            <button class="confirm" disabled>保存</button>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);

      const kbd = dialog.querySelector('.enso-shortcut-kbd');
      const confirmBtn = dialog.querySelector('.confirm');
      const cancelBtn = dialog.querySelector('.cancel');
      const tabs = dialog.querySelectorAll('.enso-shortcut-tab');
      let activeName = names[0];

      const switchTab = (name) => {
        activeName = name;
        for (const t of tabs) {
          t.classList.toggle('active', t.dataset.name === name);
        }
        const display = pendings[name] || shortcuts[name];
        kbd.textContent = this.formatShortcut(display);
        kbd.classList.toggle('recording', !!pendings[name]);
        confirmBtn.disabled = !Object.keys(pendings).length;
      };

      for (const t of tabs) {
        t.addEventListener('click', () => switchTab(t.dataset.name));
      }

      const onKeyDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (['Alt', 'Shift', 'Control', 'Meta'].includes(e.key)) return;
        if (!e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) return;
        const shortcut = {
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          code: e.code,
        };
        pendings[activeName] = shortcut;
        kbd.textContent = this.formatShortcut(shortcut);
        kbd.classList.add('recording');
        confirmBtn.disabled = false;
      };

      const cleanup = () => {
        document.removeEventListener('keydown', onKeyDown, true);
        dialog.remove();
      };

      confirmBtn.addEventListener('click', () => {
        const changed = [];
        for (const [name, shortcut] of Object.entries(pendings)) {
          this.saveShortcut(name, shortcut);
          changed.push(`${EnsoInspector.SHORTCUT_LABELS[name]}: ${this.formatShortcut(shortcut)}`);
        }
        if (changed.length) {
          this.showToast(`✅ ${changed.join('，')}`);
          this.updateMenuCommand();
        }
        cleanup();
      });
      cancelBtn.addEventListener('click', cleanup);
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) cleanup();
      });

      document.addEventListener('keydown', onKeyDown, true);
    }

    // --- Core Logic ---
    toggleMode() {
      this.isActive = !this.isActive;
      const { btn, overlay, label } = this.elements;

      if (this.isActive) {
        btn.classList.add('active');
        btn.innerHTML = CONFIG.ICONS.CLOSE;
        document.body.style.cursor = 'crosshair';
        document.addEventListener('mousemove', this.handleInspectorMove.bind(this), true);
        document.addEventListener('click', this.handleInspectorClick.bind(this), true);
      } else {
        btn.classList.remove('active');
        btn.innerHTML = CONFIG.ICONS.TARGET;
        document.body.style.cursor = '';
        overlay.style.display = 'none';
        label.style.display = 'none';
        document.removeEventListener('mousemove', this.handleInspectorMove.bind(this), true);
        document.removeEventListener('click', this.handleInspectorClick.bind(this), true);
      }
    }

    handleInspectorMove(e) {
      if (!this.isActive) return;
      const target = e.target;
      if (
        target === this.elements.btn ||
        target === this.elements.overlay ||
        target === this.elements.label
      )
        return;

      this.hoveredElement = target;
      const rect = target.getBoundingClientRect();
      const { overlay, label } = this.elements;

      overlay.style.display = 'block';
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;

      label.textContent = this.getSelector(target);
      label.style.display = 'block';

      let labelTop = rect.top - 28;
      if (labelTop < 5) labelTop = rect.bottom + 8;
      label.style.top = `${labelTop}px`;
      label.style.left = `${Math.max(8, rect.left)}px`;
    }

    handleInspectorClick(e) {
      if (!this.isActive) return;
      if (e.target.closest('.enso-fab')) return;

      e.preventDefault();
      e.stopPropagation();

      const el = this.hoveredElement;
      if (!el) return;

      const info = {
        element: `<${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ''}${el.className ? ` class="${el.className}"` : ''}>`,
        path: this.getFullPath(el),
        attributes: this.getAttributes(el),
        styles: this.getComputedStyles(el),
        position: this.getPositionAndSize(el),
        innerText: el.innerText?.substring(0, 1000) || '',
        url: window.location.href,
        timestamp: Date.now(),
        component: this.findSourceByWalkUp(el),
      };

      this.sendToEnso(info);
      this.toggleMode();
    }

    // --- Helpers ---
    getSelector(el) {
      const tag = el.tagName.toLowerCase();
      if (el.id) return `${tag}#${el.id}`;
      if (el.className && typeof el.className === 'string') {
        const classes = el.className
          .trim()
          .split(/\s+/)
          .filter((c) => c && !c.includes(':'))
          .slice(0, 2);
        if (classes.length) return `${tag}.${classes.join('.')}`;
      }
      return tag;
    }

    getFullPath(el) {
      const path = [];
      let curr = el;
      while (curr && curr !== document.body) {
        let selector = curr.tagName.toLowerCase();
        if (curr.id) {
          selector += `#${curr.id}`;
        } else if (curr.className && typeof curr.className === 'string') {
          const classes = curr.className
            .trim()
            .split(/\s+/)
            .filter((c) => c && !c.includes(':'));
          if (classes.length) selector += `.${classes[0]}`;
        }

        const parent = curr.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === curr.tagName);
          if (siblings.length > 1) {
            selector += `:nth-of-type(${siblings.indexOf(curr) + 1})`;
          }
        }
        path.unshift(selector);
        curr = parent;
      }
      return path.join(' > ');
    }

    getAttributes(el) {
      return Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value]));
    }

    getComputedStyles(el) {
      const s = window.getComputedStyle(el);
      const props = [
        'color',
        'backgroundColor',
        'fontSize',
        'fontFamily',
        'fontWeight',
        'display',
        'position',
        'zIndex',
        'margin',
        'padding',
      ];
      return Object.fromEntries(props.map((p) => [p, s[p]]));
    }

    getPositionAndSize(el) {
      const r = el.getBoundingClientRect();
      return {
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      };
    }

    /**
     * Parse vite-plugin-vue-inspector string format: "path/to/file.vue:line:column"
     */
    parseVueInspectorString(str) {
      if (!str || typeof str !== 'string') return null;
      const match = str.match(/^(.+?):(\d+)(?::(\d+))?$/);
      if (match) {
        return {
          framework: 'vue',
          file: match[1],
          line: parseInt(match[2], 10),
          column: match[3] ? parseInt(match[3], 10) : undefined,
        };
      }
      return { framework: 'vue', file: str };
    }

    /**
     * Extract component source from DOM element
     * Priority: vite-plugin-vue-inspector > Vue 3 > Vue 2 > React
     */
    getSourceFromDOM(el) {
      if (!el || typeof el.getAttribute !== 'function') return null;

      // 1. vite-plugin-vue-inspector (v3.x attribute)
      const inspectorAttr = el.getAttribute('data-v-inspector');
      if (inspectorAttr) {
        return this.parseVueInspectorString(inspectorAttr);
      }

      // 2. vite-plugin-vue-inspector (v4.0+ hidden prop in vnode)
      const vnodePaths = [
        el.__vnode?.props?.__v_inspector,
        el.__vnode?.ctx?.vnode?.props?.__v_inspector,
        el.__vnode?.component?.vnode?.props?.__v_inspector,
      ];
      for (const data of vnodePaths) {
        if (data) return this.parseVueInspectorString(data);
      }

      // 3. Vue 3: __vueParentComponent
      const vueFile = el.__vueParentComponent?.type?.__file;
      if (vueFile) {
        return { framework: 'vue', file: vueFile };
      }

      // 4. Vue 2: __vue__
      const vue2File = el.__vue__?.$options?.__file;
      if (vue2File) {
        return { framework: 'vue', file: vue2File };
      }

      // 5. React: fiber _debugSource
      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      if (fiberKey) {
        let fiber = el[fiberKey];
        while (fiber) {
          const source = fiber._debugSource || fiber._debugOwner?._debugSource;
          if (source) {
            return {
              framework: 'react',
              file: source.fileName,
              line: source.lineNumber,
              column: source.columnNumber,
            };
          }
          fiber = fiber.return;
        }
      }

      return null;
    }

    /**
     * Walk up DOM tree to find component source
     */
    findSourceByWalkUp(el) {
      let cur = el;
      for (let i = 0; i < CONFIG.MAX_WALK_UP_DEPTH && cur; i++) {
        const source = this.getSourceFromDOM(cur);
        if (source) return source;
        cur = cur.parentElement;
      }
      return null;
    }

    sendToEnso(payload) {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `http://127.0.0.1:${CONFIG.PORT}/inspect`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload),
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            this.showToast('✨ 已发送至 Enso', 'success');
          } else {
            this.showToast('连接失败，请检查 Enso 是否运行', 'error');
            console.warn('Enso Inspector Error:', payload);
          }
        },
        onerror: () => {
          this.showToast('无法连接到 Enso 服务', 'error');
          console.warn('Enso Inspector Error:', payload);
        },
      });
    }

    showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = 'enso-toast';
      const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
      toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

      document.body.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 10);

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
      }, 3000);
    }

    updateMenuCommand() {
      if (this.menuCommandId !== null) GM_unregisterMenuCommand(this.menuCommandId);
      if (this.toggleMenuCommandId !== null) GM_unregisterMenuCommand(this.toggleMenuCommandId);
      if (this.resetMenuCommandId !== null) GM_unregisterMenuCommand(this.resetMenuCommandId);
      if (this.shortcutMenuId !== null) GM_unregisterMenuCommand(this.shortcutMenuId);

      const isEnabled = this.isEnabledForSite();
      const shortcuts = this.getShortcuts();
      const label = isEnabled ? `关闭 Enso Web Inspector` : `开启 Enso Web Inspector`;
      this.menuCommandId = GM_registerMenuCommand(label, () => {
        if (isEnabled) {
          this.setEnabledForSite(false);
          this.destroyUI();
          this.showToast('Web Inspector 已禁用');
        } else {
          this.setEnabledForSite(true);
          this.createUI();
          this.showToast('Web Inspector 已启用', 'success');
        }
        this.updateMenuCommand();
      });
      if (isEnabled) {
        const toggleKey = this.formatShortcut(shortcuts.toggle);
        const resetKey = this.formatShortcut(shortcuts.reset);
        const toggleLabel = this.isActive
          ? `关闭元素选择 (${toggleKey})`
          : `开启元素选择 (${toggleKey})`;
        this.toggleMenuCommandId = GM_registerMenuCommand(toggleLabel, () => {
          this.toggleMode();
          this.updateMenuCommand();
        });
        this.resetMenuCommandId = GM_registerMenuCommand(`复位按钮位置 (${resetKey})`, () => {
          this.resetPosition();
        });
        this.shortcutMenuId = GM_registerMenuCommand('⌨️ 快捷键设置', () => {
          this.showShortcutDialog();
        });
      }
    }
  }

  // 启动
  new EnsoInspector();
})();
